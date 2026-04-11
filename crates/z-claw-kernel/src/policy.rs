use crate::config::PolicyConfig;
use crate::error::{KernelError, Result};
use crate::protocol::{AuditKind, AuditRecord, SchedulePayload};
use parking_lot::{Mutex, RwLock};
use std::collections::VecDeque;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct PolicyEngine {
    cfg: Arc<RwLock<PolicyConfig>>,
    audit: Arc<Mutex<VecDeque<AuditRecord>>>,
}

impl PolicyEngine {
    pub fn new(cfg: PolicyConfig) -> Self {
        Self {
            cfg: Arc::new(RwLock::new(cfg)),
            audit: Arc::new(Mutex::new(VecDeque::with_capacity(256))),
        }
    }

    pub fn replace_cfg(&self, cfg: PolicyConfig) {
        *self.cfg.write() = cfg;
    }

    fn now_ms() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }

    fn push_audit(&self, kind: AuditKind, msg: impl AsRef<str>) {
        let record = AuditRecord {
            timestamp_ms: Self::now_ms(),
            kind,
            message: msg.as_ref().to_string(),
        };
        let mut q = self.audit.lock();
        if q.len() >= 256 {
            q.pop_front();
        }
        q.push_back(record);
    }

    pub fn drain_audit(&self, max: usize) -> Vec<AuditRecord> {
        let mut q = self.audit.lock();
        let take = q.len().min(max);
        q.drain(..take).collect()
    }

    pub fn validate_tool_call(&self, tool_name: &str, arguments: &serde_json::Value) -> Result<()> {
        let cfg = self.cfg.read();
        if cfg
            .blocked_tool_names
            .iter()
            .any(|b| b.eq_ignore_ascii_case(tool_name))
        {
            let reason = format!("tool blocked by policy: {tool_name}");
            self.push_audit(AuditKind::Policy, &reason);
            return Err(KernelError::PolicyDenied(reason));
        }
        drop(cfg);
        self.validate_path_arguments(arguments)?;
        self.push_audit(AuditKind::Tool, format!("tool allowed: {tool_name}"));
        Ok(())
    }

    fn validate_path_arguments(&self, arguments: &serde_json::Value) -> Result<()> {
        let cfg = self.cfg.read();
        let prefixes = &cfg.allowed_path_prefixes;
        if prefixes.is_empty() {
            return Ok(());
        }
        let paths = collect_path_strings(arguments);
        for p in paths {
            let ok = prefixes.iter().any(|pre| p.starts_with(pre));
            if !ok {
                let reason = format!("path not under allowed prefix: {p}");
                self.push_audit(AuditKind::Policy, &reason);
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
        let cfg = self.cfg.read();
        if payload.prompt.trim().is_empty() {
            let msg = "empty schedule prompt";
            self.push_audit(AuditKind::Schedule, msg);
            return Err(KernelError::PolicyDenied(msg.into()));
        }
        let schedule = cron::Schedule::from_str(cron_expr)
            .map_err(|e| KernelError::InvalidCron(format!("{cron_expr}: {e}")))?;
        let upcoming: Vec<_> = schedule.upcoming(chrono::Utc).take(2).collect();
        if upcoming.len() >= 2 {
            let a = upcoming[0].timestamp();
            let b = upcoming[1].timestamp();
            let gap = (b - a).unsigned_abs();
            if gap < cfg.min_schedule_interval_sec {
                let reason = format!(
                    "schedule interval {gap}s < min {}s",
                    cfg.min_schedule_interval_sec
                );
                self.push_audit(AuditKind::Schedule, &reason);
                return Err(KernelError::PolicyDenied(reason));
            }
        }
        self.push_audit(AuditKind::Schedule, "schedule proposal accepted by policy");
        Ok(())
    }

    pub fn max_swarm_tasks(&self) -> usize {
        self.cfg.read().max_swarm_tasks.max(1)
    }

    pub fn require_tool_approval(&self) -> bool {
        self.cfg.read().require_tool_approval
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
