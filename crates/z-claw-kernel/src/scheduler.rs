use crate::error::{KernelError, Result};
use crate::protocol::SchedulePayload;
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;

pub struct JobScheduler {
    conn: Arc<Mutex<Connection>>,
}

impl JobScheduler {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| KernelError::Message(e.to_string()))?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r"
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS scheduled_jobs (
                id TEXT PRIMARY KEY,
                cron_expr TEXT NOT NULL,
                timezone TEXT NOT NULL,
                prompt TEXT NOT NULL,
                target_session_id TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_fired_ms INTEGER
            );
            ",
        )?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn add_job(
        &self,
        id: &str,
        cron_expr: &str,
        timezone: &str,
        payload: &SchedulePayload,
    ) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "INSERT INTO scheduled_jobs (id, cron_expr, timezone, prompt, target_session_id, enabled, last_fired_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, NULL)",
            params![
                id,
                cron_expr,
                timezone,
                payload.prompt,
                payload.target_session_id,
            ],
        )?;
        Ok(())
    }

    pub fn remove_job(&self, id: &str) -> Result<()> {
        let c = self.conn.lock();
        c.execute("DELETE FROM scheduled_jobs WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_jobs(&self) -> Result<Vec<(String, String, String, bool, String)>> {
        let c = self.conn.lock();
        let mut stmt = c.prepare(
            "SELECT id, cron_expr, timezone, enabled, prompt FROM scheduled_jobs ORDER BY id",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)? != 0,
                r.get::<_, String>(4)?,
            ))
        })?;
        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Returns job ids that are due now (cron, interpreted in UTC for MVP).
    pub fn due_jobs(&self, now_ms: i64) -> Result<Vec<String>> {
        let c = self.conn.lock();
        let mut stmt = c.prepare(
            "SELECT id, cron_expr, last_fired_ms FROM scheduled_jobs WHERE enabled = 1",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<i64>>(2)?,
            ))
        })?;
        let mut due = vec![];
        for row in rows {
            let (id, expr, last) = row?;
            let schedule = cron::Schedule::from_str(&expr)
                .map_err(|e| KernelError::InvalidCron(format!("{expr}: {e}")))?;
            let after = chrono::DateTime::from_timestamp_millis(last.unwrap_or(0))
                .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
            let now = chrono::DateTime::from_timestamp_millis(now_ms)
                .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
            let next: Option<chrono::DateTime<chrono::Utc>> = schedule.after(&after).next();
            if let Some(n) = next {
                if n <= now {
                    due.push(id);
                }
            }
        }
        Ok(due)
    }

    pub fn job_payload(&self, id: &str) -> Result<Option<(String, Option<String>)>> {
        let c = self.conn.lock();
        c.query_row(
            "SELECT prompt, target_session_id FROM scheduled_jobs WHERE id = ?1 AND enabled = 1",
            params![id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn mark_fired(&self, id: &str, now_ms: i64) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "UPDATE scheduled_jobs SET last_fired_ms = ?1 WHERE id = ?2",
            params![now_ms, id],
        )?;
        Ok(())
    }
}
