use crate::error::{KernelError, Result};
use crate::protocol::SchedulePayload;
use chrono_tz::Tz;
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

    /// Returns job ids that are due now, interpreting cron in each job's configured IANA timezone.
    pub fn due_jobs(&self, now_ms: i64) -> Result<Vec<String>> {
        let c = self.conn.lock();
        let mut stmt = c.prepare(
            "SELECT id, cron_expr, timezone, last_fired_ms FROM scheduled_jobs WHERE enabled = 1",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<i64>>(3)?,
            ))
        })?;
        let mut due = vec![];
        let now_utc = datetime_from_millis(now_ms);
        for row in rows {
            let (id, expr, timezone, last) = row?;
            let schedule = cron::Schedule::from_str(&expr)
                .map_err(|e| KernelError::InvalidCron(format!("{expr}: {e}")))?;
            let tz = parse_timezone(&timezone)?;
            let after = datetime_from_millis(last.unwrap_or(0)).with_timezone(&tz);
            let now = now_utc.with_timezone(&tz);
            let next = schedule.after(&after).next();
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

fn parse_timezone(timezone: &str) -> Result<Tz> {
    timezone
        .parse::<Tz>()
        .map_err(|_| KernelError::Message(format!("invalid timezone: {timezone}")))
}

fn datetime_from_millis(ts_ms: i64) -> chrono::DateTime<chrono::Utc> {
    chrono::DateTime::from_timestamp_millis(ts_ms)
        .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).expect("unix epoch"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::path::PathBuf;

    fn test_db_path(name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "z-claw-scheduler-{name}-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        path
    }

    fn scheduler(name: &str) -> JobScheduler {
        let path = test_db_path(name);
        JobScheduler::open(&path).expect("open scheduler")
    }

    fn sample_payload() -> SchedulePayload {
        SchedulePayload {
            prompt: "run task".into(),
            target_session_id: None,
        }
    }

    #[test]
    fn due_jobs_respects_job_timezone() {
        let scheduler = scheduler("timezone");
        scheduler
            .add_job(
                "shanghai",
                "0 0 9 * * *",
                "Asia/Shanghai",
                &sample_payload(),
            )
            .expect("insert shanghai job");
        scheduler
            .add_job("utc", "0 0 9 * * *", "UTC", &sample_payload())
            .expect("insert utc job");
        scheduler
            .mark_fired(
                "shanghai",
                chrono::Utc
                    .with_ymd_and_hms(2026, 4, 4, 1, 0, 0)
                    .single()
                    .expect("valid shanghai fire timestamp")
                    .timestamp_millis(),
            )
            .expect("mark shanghai last fired");
        scheduler
            .mark_fired(
                "utc",
                chrono::Utc
                    .with_ymd_and_hms(2026, 4, 4, 9, 0, 0)
                    .single()
                    .expect("valid utc fire timestamp")
                    .timestamp_millis(),
            )
            .expect("mark utc last fired");

        let now_ms = chrono::Utc
            .with_ymd_and_hms(2026, 4, 5, 1, 1, 0)
            .single()
            .expect("valid timestamp")
            .timestamp_millis();
        let due = scheduler.due_jobs(now_ms).expect("due jobs");

        assert!(due.iter().any(|id| id == "shanghai"));
        assert!(!due.iter().any(|id| id == "utc"));
    }

    #[test]
    fn due_jobs_skips_job_after_mark_fired_until_next_occurrence() {
        let scheduler = scheduler("mark-fired");
        scheduler
            .add_job("daily", "0 0 9 * * *", "Asia/Shanghai", &sample_payload())
            .expect("insert daily job");

        let now = chrono::Utc
            .with_ymd_and_hms(2026, 4, 5, 1, 1, 0)
            .single()
            .expect("valid timestamp");
        let now_ms = now.timestamp_millis();

        assert_eq!(
            scheduler.due_jobs(now_ms).expect("initial due"),
            vec!["daily"]
        );

        scheduler
            .mark_fired("daily", now_ms)
            .expect("mark job as fired");

        assert!(
            scheduler
                .due_jobs(now_ms)
                .expect("due after mark fired")
                .is_empty()
        );
    }

    #[test]
    fn due_jobs_rejects_invalid_timezone() {
        let scheduler = scheduler("invalid-timezone");
        scheduler
            .add_job("broken", "0 0 9 * * *", "Mars/Olympus", &sample_payload())
            .expect("insert invalid timezone job");

        let err = scheduler
            .due_jobs(0)
            .expect_err("invalid timezone should fail");

        assert!(err.to_string().contains("invalid timezone"));
    }
}
