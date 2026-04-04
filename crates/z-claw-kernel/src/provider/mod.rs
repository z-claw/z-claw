mod openai;
pub use openai::OpenAiCompatibleProvider;

use crate::error::Result;
use async_trait::async_trait;
use futures::Stream;
use serde_json::Value;
use std::pin::Pin;

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub tool_calls: Option<serde_json::Value>,
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: "tool".into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters_json: Value,
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolDefinition>,
    pub stream: bool,
}

#[derive(Debug, Clone)]
pub struct StreamChunk {
    pub content_delta: Option<String>,
    pub finish_reason: Option<String>,
    pub tool_calls_delta: Vec<ToolCallFragment>,
}

#[derive(Debug, Clone, Default)]
pub struct ToolCallFragment {
    pub index: usize,
    pub id: Option<String>,
    pub name: Option<String>,
    pub arguments_delta: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ResolvedToolCall {
    pub id: String,
    pub name: String,
    pub arguments_json: String,
}

#[async_trait]
pub trait ChatProvider: Send + Sync {
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamChunk>> + Send>>>;
}
