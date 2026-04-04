use crate::error::{KernelError, Result};
use crate::provider::{ChatProvider, ChatRequest, StreamChunk, ToolCallFragment};
use async_trait::async_trait;
use futures::Stream;
use futures_util::StreamExt;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
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
        let res = self
            .client
            .get(url)
            .headers(self.headers()?)
            .send()
            .await?;
        let status = res.status();
        if !status.is_success() {
            let t = res.text().await.unwrap_or_default();
            return Err(KernelError::Message(format!(
                "GET /models -> {status}: {t}"
            )));
        }
        Ok(format!("GET /models -> {status}"))
    }
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
            let content = message["content"]
                .as_str()
                .unwrap_or("")
                .to_string();
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
