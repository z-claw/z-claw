use crate::config::PolicyConfig;
use crate::error::{KernelError, Result};
use crate::protocol::SchedulePayload;
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct PolicyEngine {
    cfg: PolicyConfig,
    audit: Arc<Mutex<VecDeque<String>>>,
}

impl PolicyEngine {
    pub fn new(cfg: PolicyConfig) -> Self {
        Self {
            cfg,
            audit: Arc::new(Mutex::new(VecDeque::with_capacity(256))),
        }
    }

    fn now_line(&self, msg: impl AsRef<str>) {
        let ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let line = format!("[{ms}] {}", msg.as_ref());
        let mut q = self.audit.lock();
        if q.len() >= 256 {
            q.pop_front();
        }
        q.push_back(line);
    }

    pub fn drain_audit(&self, max: usize) -> Vec<String> {
        let mut q = self.audit.lock();
        let take = q.len().min(max);
        q.drain(..take).collect()
    }

    pub fn validate_tool_call(
        &self,
        tool_name: &str,
        arguments: &serde_json::Value,
    ) -> Result<()> {
        if self
            .cfg
            .blocked_tool_names
            .iter()
            .any(|b| b.eq_ignore_ascii_case(tool_name))
        {
            let reason = format!("tool blocked by policy: {tool_name}");
            self.now_line(&reason);
            return Err(KernelError::PolicyDenied(reason));
        }
        self.validate_path_arguments(arguments)?;
        self.now_line(format!("tool allowed: {tool_name}"));
        Ok(())
    }

    fn validate_path_arguments(&self, arguments: &serde_json::Value) -> Result<()> {
        let prefixes = &self.cfg.allowed_path_prefixes;
        if prefixes.is_empty() {
            return Ok(());
        }
        let paths = collect_path_strings(arguments);
        for p in paths {
            let ok = prefixes.iter().any(|pre| p.starts_with(pre));
            if !ok {
                let reason = format!("path not under allowed prefix: {p}");
                self.now_line(&reason);
                return Err(KernelError::PolicyDenied(reason));
            }
        }
        Ok(())
    }

    /// Validates a cron expression and schedule payload before persistence.
    pub fn validate_schedule_proposal(
        &self,
        cron_expr: &str,
        payload: &SchedulePayload,
    ) -> Result<()> {
        if payload.prompt.trim().is_empty() {
            return Err(KernelError::PolicyDenied("empty schedule prompt".into()));
        }
        let schedule = cron::Schedule::from_str(cron_expr).map_err(|e| {
            KernelError::InvalidCron(format!("{cron_expr}: {e}"))
        })?;
        let upcoming: Vec<_> = schedule
            .upcoming(chrono::Utc)
            .take(2)
            .collect();
        if upcoming.len() >= 2 {
            let a = upcoming[0].timestamp();
            let b = upcoming[1].timestamp();
            let gap = (b - a).unsigned_abs();
            if gap < self.cfg.min_schedule_interval_sec {
                let reason = format!(
                    "schedule interval {gap}s < min {}s",
                    self.cfg.min_schedule_interval_sec
                );
                self.now_line(&reason);
                return Err(KernelError::PolicyDenied(reason));
            }
        }
        self.now_line("schedule proposal accepted by policy");
        Ok(())
    }

    pub fn max_swarm_tasks(&self) -> usize {
        self.cfg.max_swarm_tasks.max(1)
    }
}

fn collect_path_strings(v: &serde_json::Value) -> Vec<String> {
    let mut out = vec![];
    match v {
        serde_json::Value::Object(map) => {
            for (k, val) in map {
                if k.ends_with("path") || k.ends_with("_path") || k == "file" || k == "filepath" {
                    if let Some(s) = val.as_str() {
                        out.push(s.to_string());
                    }
                }
                out.extend(collect_path_strings(val));
            }
        }
        serde_json::Value::Array(a) => {
            for x in a {
                out.extend(collect_path_strings(x));
            }
        }
        _ => {}
    }
    out
}
