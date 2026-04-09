//! OpenAI-compatible HTTP client (`/chat/completions`, streaming SSE, `/models` health ping).
//! 非流式、无 tools 的补全走 **aisdk** `OpenAICompatible`；主对话流式、工具调用与含 `tool_calls` 的多轮历史仍用 **reqwest**（aisdk 的 `Message` 无法表达单条 assistant 多 tool_calls，且流式 tool delta 不带 index）。
//! 仅配置即可对接的厂商见仓库 `docs/adding-openai-compatible-provider.md`。

use crate::error::{KernelError, Result};
use crate::provider::{ChatProvider, ChatRequest, StreamChunk, ToolCallFragment, ToolDefinition};
use aisdk::core::language_model::{LanguageModelOptions, LanguageModelResponseContentType};
use aisdk::core::tools::{Tool, ToolExecute, ToolResultInfo};
use aisdk::core::{
    DynamicModel, LanguageModel, LanguageModelRequest, Message, Messages,
};
use aisdk::providers::OpenAICompatible;
use async_trait::async_trait;
use futures::Stream;
use futures_util::StreamExt;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT, HeaderMap, HeaderValue};
use schemars::Schema;
use serde_json::{Value, json};
use std::pin::Pin;

pub struct OpenAiCompatibleProvider {
    client: reqwest::Client,
    base_url: String,
    api_key: String,
}

impl OpenAiCompatibleProvider {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .use_rustls_tls()
                .build()
                .expect("reqwest client"),
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
        }
    }

    fn headers(&self) -> Result<HeaderMap> {
        let mut h = HeaderMap::new();
        h.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key))
                .map_err(|e| KernelError::Message(e.to_string()))?,
        );
        h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        
        // Spoof Tongyi Lingma IDE User-Agent globally or for dashscope
        if self.base_url.contains("dashscope") {
            h.insert(USER_AGENT, HeaderValue::from_static("zh-CN; IDE/1.49.1; TongyiLingma/1.0.0"));
        } else {
            h.insert(USER_AGENT, HeaderValue::from_static("z-claw/0.1.0"));
        }
        
        Ok(h)
    }

    fn build_body(req: &ChatRequest) -> Value {
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|m| {
                let mut o = serde_json::Map::new();
                o.insert("role".into(), json!(m.role));
                o.insert("content".into(), json!(m.content));
                if let Some(tc) = &m.tool_calls {
                    o.insert("tool_calls".into(), tc.clone());
                }
                if let Some(id) = &m.tool_call_id {
                    o.insert("tool_call_id".into(), json!(id));
                }
                Value::Object(o)
            })
            .collect();
        let mut body = json!({
            "model": req.model,
            "messages": messages,
            "stream": req.stream,
        });
        if !req.tools.is_empty() {
            let tools: Vec<Value> = req
                .tools
                .iter()
                .map(|t| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters_json,
                        }
                    })
                })
                .collect();
            body.as_object_mut()
                .expect("object")
                .insert("tools".into(), json!(tools));
        }
        body
    }

    /// Lightweight GET `{base}/models` for health checks (OpenAI-compatible).
    pub async fn ping_models(&self) -> Result<String> {
        let url = format!("{}/models", self.base_url);
        let res = self.client.get(url).headers(self.headers()?).send().await?;
        let status = res.status();
        if !status.is_success() {
            let t = res.text().await.unwrap_or_default();
            return Err(KernelError::Message(format!(
                "GET /models -> {status}: {t}"
            )));
        }
        Ok(format!("GET /models -> {status}"))
    }

    /// 单次非流式补全（`stream: false`）。用于 Delegate / Swarm 等无工具场景，经 **aisdk** 调用 OpenAI 兼容接口。
    pub async fn chat_complete(&self, request: ChatRequest) -> Result<String> {
        if request.stream {
            return Err(KernelError::Message(
                "chat_complete expects request.stream == false".into(),
            ));
        }
        let provider = OpenAICompatible::<DynamicModel>::builder()
            .base_url(self.base_url.clone())
            .api_key(self.api_key.clone())
            .model_name(request.model.clone())
            .build()
            .map_err(|e| KernelError::Message(e.to_string()))?;

        let messages = chat_messages_to_aisdk(&request.messages)?;
        let mut b = LanguageModelRequest::builder()
            .model(provider)
            .messages(messages);
        for t in &request.tools {
            b = b.with_tool(tool_def_to_aisdk(t)?);
        }
        let built = b.build();
        let opts = LanguageModelOptions::clone(&*built);
        let mut model = built.model;
        let resp = model
            .generate_text(opts)
            .await
            .map_err(|e| KernelError::Message(e.to_string()))?;
        aisdk_response_to_text(resp.contents)
    }
}

fn tool_def_to_aisdk(t: &ToolDefinition) -> Result<Tool> {
    let input_schema: Schema = serde_json::from_value(t.parameters_json.clone()).unwrap_or_else(|_| {
        serde_json::from_value(json!({
            "type": "object",
            "properties": {}
        }))
        .unwrap_or_else(|_| true.into())
    });
    Ok(Tool {
        name: t.name.clone(),
        description: t.description.clone(),
        input_schema,
        execute: ToolExecute::new(Box::new(|_| Ok(String::new()))),
    })
}

fn chat_messages_to_aisdk(msgs: &[crate::provider::ChatMessage]) -> Result<Messages> {
    let mut out: Messages = Vec::new();
    for m in msgs {
        match m.role.as_str() {
            "system" => out.push(Message::System(m.content.clone().into())),
            "user" => out.push(Message::User(m.content.clone().into())),
            "assistant" => {
                if m.tool_calls.is_some() {
                    return Err(KernelError::Message(
                        "aisdk chat path does not support assistant messages with tool_calls"
                            .into(),
                    ));
                }
                out.push(Message::Assistant(m.content.clone().into()));
            }
            "tool" => {
                let mut tr = ToolResultInfo::new("");
                if let Some(id) = &m.tool_call_id {
                    tr.id(id.clone());
                }
                let parsed: Value = serde_json::from_str(&m.content)
                    .unwrap_or_else(|_| Value::String(m.content.clone()));
                tr.output(parsed);
                out.push(Message::Tool(tr));
            }
            role => {
                return Err(KernelError::Message(format!(
                    "unknown chat message role for aisdk: {role}"
                )));
            }
        }
    }
    Ok(out)
}

fn aisdk_response_to_text(contents: Vec<LanguageModelResponseContentType>) -> Result<String> {
    let mut out = String::new();
    for c in contents {
        match c {
            LanguageModelResponseContentType::Text(t) => out.push_str(&t),
            LanguageModelResponseContentType::ToolCall(tc) => {
                use std::fmt::Write as _;
                let _ = write!(
                    out,
                    "\n[tool {} id={}]\n{}",
                    tc.tool.name,
                    tc.tool.id,
                    tc.input
                );
            }
            LanguageModelResponseContentType::Reasoning { content, .. } => out.push_str(&content),
            LanguageModelResponseContentType::NotSupported(msg) => {
                return Err(KernelError::Message(msg));
            }
        }
    }
    Ok(out)
}

#[async_trait]
impl ChatProvider for OpenAiCompatibleProvider {
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamChunk>> + Send>>> {
        let url = format!("{}/chat/completions", self.base_url);
        let body = Self::build_body(&request);
        let res = self
            .client
            .post(url)
            .headers(self.headers()?)
            .json(&body)
            .send()
            .await?;
        let status = res.status();
        if !status.is_success() {
            let t = res.text().await.unwrap_or_default();
            return Err(KernelError::Message(format!("LLM HTTP {status}: {t}")));
        }
        if !request.stream {
            let v: Value = res.json().await?;
            let choice = &v["choices"][0];
            let message = &choice["message"];
            let content = message["content"].as_str().unwrap_or("").to_string();
            let mut tool_frags = vec![];
            if let Some(arr) = message["tool_calls"].as_array() {
                for (i, tc) in arr.iter().enumerate() {
                    tool_frags.push(ToolCallFragment {
                        index: i,
                        id: tc["id"].as_str().map(String::from),
                        name: tc["function"]["name"].as_str().map(String::from),
                        arguments_delta: tc["function"]["arguments"].as_str().map(String::from),
                    });
                }
            }
            let finish = choice["finish_reason"].as_str().map(String::from);
            let out = async_stream::try_stream! {
                if !content.is_empty() {
                    yield StreamChunk {
                        content_delta: Some(content),
                        finish_reason: None,
                        tool_calls_delta: vec![],
                    };
                }
                for f in tool_frags {
                    yield StreamChunk {
                        content_delta: None,
                        finish_reason: None,
                        tool_calls_delta: vec![f],
                    };
                }
                yield StreamChunk {
                    content_delta: None,
                    finish_reason: finish.or(Some("stop".into())),
                    tool_calls_delta: vec![],
                };
            };
            return Ok(Box::pin(out));
        }
        let byte_stream = res.bytes_stream();
        let out = async_stream::try_stream! {
            let mut buf = String::new();
            futures_util::pin_mut!(byte_stream);
            while let Some(item) = byte_stream.next().await {
                let chunk = item.map_err(KernelError::Http)?;
                buf.push_str(&String::from_utf8_lossy(&chunk));
                while let Some(pos) = buf.find('\n') {
                    let line = buf[..pos].trim().to_string();
                    buf.drain(..=pos);
                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }
                    let data = line.strip_prefix("data:").map(str::trim).unwrap_or(&line);
                    if data == "[DONE]" {
                        yield StreamChunk {
                            content_delta: None,
                            finish_reason: Some("stop".into()),
                            tool_calls_delta: vec![],
                        };
                        continue;
                    }
                    let v: Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let choice = &v["choices"][0];
                    let delta = &choice["delta"];
                    let content = delta["content"].as_str().map(String::from);
                    let mut frags = vec![];
                    if let Some(arr) = delta["tool_calls"].as_array() {
                        for (i, tc) in arr.iter().enumerate() {
                            let idx = tc["index"].as_u64().unwrap_or(i as u64) as usize;
                            frags.push(ToolCallFragment {
                                index: idx,
                                id: tc["id"].as_str().map(String::from),
                                name: tc["function"]["name"].as_str().map(String::from),
                                arguments_delta: tc["function"]["arguments"].as_str().map(String::from),
                            });
                        }
                    }
                    let finish = choice["finish_reason"].as_str().map(String::from);
                    if content.is_some() || !frags.is_empty() || finish.is_some() {
                        yield StreamChunk {
                            content_delta: content,
                            finish_reason: finish,
                            tool_calls_delta: frags,
                        };
                    }
                }
            }
        };
        Ok(Box::pin(out))
    }
}
