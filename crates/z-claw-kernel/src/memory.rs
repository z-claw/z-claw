use crate::error::{KernelError, Result};
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;
use std::sync::Arc;

pub struct MemoryEngine {
    conn: Arc<Mutex<Connection>>,
}

impl MemoryEngine {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| KernelError::Message(e.to_string()))?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r"
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_ms INTEGER NOT NULL,
                updated_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS episodic (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                summary TEXT NOT NULL,
                created_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS knowledge (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                deleted INTEGER NOT NULL DEFAULT 0,
                created_ms INTEGER NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
                kid UNINDEXED,
                title,
                body,
                tokenize = 'porter'
            );
            CREATE TABLE IF NOT EXISTS project_intel (
                workspace_root TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                updated_ms INTEGER NOT NULL
            );
            ",
        )?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn upsert_session(&self, id: &str, title: &str, now_ms: i64) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "INSERT INTO sessions (id, title, created_ms, updated_ms) VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_ms=excluded.updated_ms",
            params![id, title, now_ms],
        )?;
        Ok(())
    }

    pub fn append_message(&self, id: &str, session_id: &str, role: &str, content: &str, now_ms: i64) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "INSERT INTO messages (id, session_id, role, content, created_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, session_id, role, content, now_ms],
        )?;
        c.execute(
            "UPDATE sessions SET updated_ms = ?1 WHERE id = ?2",
            params![now_ms, session_id],
        )?;
        Ok(())
    }

    pub fn list_sessions(&self) -> Result<Vec<(String, String, i64)>> {
        let c = self.conn.lock();
        let mut stmt = c.prepare("SELECT id, title, updated_ms FROM sessions ORDER BY updated_ms DESC")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        let mut out = vec![];
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn load_recent_messages(&self, session_id: &str, limit: usize) -> Result<Vec<(String, String)>> {
        let c = self.conn.lock();
        let mut stmt = c.prepare(
            "SELECT role, content FROM messages WHERE session_id = ?1 ORDER BY created_ms DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![session_id, limit as i64], |r| Ok((r.get(0)?, r.get(1)?)))?;
        let mut out: Vec<_> = rows.filter_map(|x| x.ok()).collect();
        out.reverse();
        Ok(out)
    }

    pub fn store_episodic(&self, id: &str, session_id: &str, summary: &str, now_ms: i64) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "INSERT INTO episodic (id, session_id, summary, created_ms) VALUES (?1, ?2, ?3, ?4)",
            params![id, session_id, summary, now_ms],
        )?;
        Ok(())
    }

    pub fn store_knowledge(&self, id: &str, title: &str, body: &str, now_ms: i64) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "INSERT INTO knowledge (id, title, body, deleted, created_ms) VALUES (?1, ?2, ?3, 0, ?4)",
            params![id, title, body, now_ms],
        )?;
        c.execute(
            "INSERT INTO knowledge_fts (kid, title, body) VALUES (?1, ?2, ?3)",
            params![id, title, body],
        )?;
        Ok(())
    }

    pub fn forget_knowledge(&self, entry_id: &str) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "UPDATE knowledge SET deleted = 1 WHERE id = ?1",
            params![entry_id],
        )?;
        c.execute("DELETE FROM knowledge_fts WHERE kid = ?1", params![entry_id])?;
        Ok(())
    }

    pub fn upsert_project_intel(&self, workspace_root: &str, summary: &str, now_ms: i64) -> Result<()> {
        let c = self.conn.lock();
        c.execute(
            "INSERT INTO project_intel (workspace_root, summary, updated_ms) VALUES (?1, ?2, ?3)
             ON CONFLICT(workspace_root) DO UPDATE SET summary=excluded.summary, updated_ms=excluded.updated_ms",
            params![workspace_root, summary, now_ms],
        )?;
        Ok(())
    }

    /// Recall text snippets up to an approximate token budget (chars / 4).
    pub fn recall(
        &self,
        session_id: &str,
        workspace_root: Option<&str>,
        query: &str,
        budget_tokens: u32,
    ) -> Result<Vec<String>> {
        let budget_chars = (budget_tokens as usize).saturating_mul(4).max(64);
        let mut snippets = vec![];
        let mut used = 0usize;
        let c = self.conn.lock();

        if let Some(root) = workspace_root {
            if let Some((sum,)) = c
                .query_row(
                    "SELECT summary FROM project_intel WHERE workspace_root = ?1",
                    params![root],
                    |r| Ok((r.get::<_, String>(0)?,)),
                )
                .optional()?
            {
                let s = format!("[project_intel] {sum}");
                used += s.len();
                if used <= budget_chars {
                    snippets.push(s);
                }
            }
        }

        let q = query.trim();
        if !q.is_empty() {
            let mut stmt = c.prepare(
                "SELECT k.title, k.body FROM knowledge_fts f
                 JOIN knowledge k ON k.id = f.kid AND k.deleted = 0
                 WHERE f MATCH ?1
                 ORDER BY rank LIMIT 12",
            )?;
            let q_fts = escape_fts5_query(q);
            let rows = stmt.query_map(params![q_fts], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            for row in rows {
                let (t, b) = row?;
                let s = format!("[knowledge] {t}: {b}");
                if used + s.len() > budget_chars {
                    break;
                }
                used += s.len();
                snippets.push(s);
            }
        }

        let mut stmt = c.prepare(
            "SELECT summary FROM episodic WHERE session_id = ?1 ORDER BY created_ms DESC LIMIT 20",
        )?;
        let rows = stmt.query_map(params![session_id], |r| r.get::<_, String>(0))?;
        for row in rows {
            let s = format!("[episodic] {}", row?);
            if used + s.len() > budget_chars {
                break;
            }
            used += s.len();
            snippets.push(s);
        }

        Ok(snippets)
    }
}

fn escape_fts5_query(q: &str) -> String {
    let mut out = String::new();
    for part in q.split_whitespace() {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push('"');
        out.push_str(&part.replace('\"', "\"\""));
        out.push_str("\"*");
        out.push('"');
    }
    if out.is_empty() {
        "\"\"".into()
    } else {
        out
    }
}
