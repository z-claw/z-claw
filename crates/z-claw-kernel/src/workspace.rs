use crate::error::{KernelError, Result};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AgentProfile {
    pub id: String,
    pub identity_prompt: String,
    pub memory_text: String,
}

pub struct WorkspaceManager {
    pub root: PathBuf,
}

impl WorkspaceManager {
    pub fn new(data_dir: &Path) -> Self {
        let root = data_dir.join("workspace");
        if !root.exists() {
            let _ = fs::create_dir_all(&root);
        }

        let default_agent_dir = root.join("DefaultAgent");
        if !default_agent_dir.exists() {
            let _ = fs::create_dir_all(&default_agent_dir);
            let _ = fs::write(
                default_agent_dir.join("IDENTITY.md"),
                "You are z-claw, an intelligent desktop agent with deep access to the host machine. You can use your tools to perform actions on behalf of the user.",
            );
            let _ = fs::write(default_agent_dir.join("MEMORY.md"), "- I am a helpful agent.\n- I run in a rust-based sandbox.\n");
        }

        Self { root }
    }

    pub fn list_agents(&self) -> Result<Vec<String>> {
        let mut agents = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.root) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_dir() {
                        if let Some(name) = entry.file_name().to_str() {
                            agents.push(name.to_string());
                        }
                    }
                }
            }
        }
        agents.sort();
        Ok(agents)
    }

    pub fn load_agent_profile(&self, agent_id: &str) -> Result<AgentProfile> {
        let agent_dir = self.root.join(agent_id);
        if !agent_dir.exists() || !agent_dir.is_dir() {
            return Err(KernelError::Message(format!(
                "Agent profile not found: {}",
                agent_id
            )));
        }

        let identity = fs::read_to_string(agent_dir.join("IDENTITY.md"))
            .unwrap_or_else(|_| "You are a helpful assistant.".into());
        let memory =
            fs::read_to_string(agent_dir.join("MEMORY.md")).unwrap_or_else(|_| "".into());

        Ok(AgentProfile {
            id: agent_id.to_string(),
            identity_prompt: identity,
            memory_text: memory,
        })
    }

    pub fn save_agent_profile(&self, agent_id: &str, identity: &str, memory: &str) -> Result<()> {
        let agent_dir = self.root.join(agent_id);
        if !agent_dir.exists() || !agent_dir.is_dir() {
            return Err(KernelError::Message(format!(
                "Agent profile not found: {}",
                agent_id
            )));
        }
        fs::write(agent_dir.join("IDENTITY.md"), identity)
            .map_err(|e| KernelError::Message(e.to_string()))?;
        fs::write(agent_dir.join("MEMORY.md"), memory)
            .map_err(|e| KernelError::Message(e.to_string()))?;
        Ok(())
    }

    pub fn create_agent_profile(&self, agent_id: &str) -> Result<()> {
        let agent_dir = self.root.join(agent_id);
        if agent_dir.exists() {
            return Err(KernelError::Message(format!("Agent profile already exists: {}", agent_id)));
        }
        
        fs::create_dir_all(&agent_dir).map_err(|e| KernelError::Message(e.to_string()))?;
        fs::write(agent_dir.join("IDENTITY.md"), "You are a new specialized agent. Please define your identity here.").map_err(|e| KernelError::Message(e.to_string()))?;
        fs::write(agent_dir.join("MEMORY.md"), "").map_err(|e| KernelError::Message(e.to_string()))?;
        
        Ok(())
    }
}
