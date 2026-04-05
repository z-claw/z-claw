//! 按顺序尝试多个 OpenAI 兼容端点（主提供商 + `routing.fallback_chain`）。

use crate::error::{KernelError, Result};
use crate::provider::{ChatProvider, ChatRequest, OpenAiCompatibleProvider, StreamChunk};
use futures::Stream;
use std::pin::Pin;
use std::sync::Arc;

pub async fn chat_stream_with_fallback(
    chain: &[(Arc<OpenAiCompatibleProvider>, String)],
    request: ChatRequest,
) -> Result<Pin<Box<dyn Stream<Item = Result<StreamChunk>> + Send>>> {
    if chain.is_empty() {
        return Err(KernelError::Message(
            "LLM routing chain is empty (misconfigured)".into(),
        ));
    }
    let mut last_err: Option<KernelError> = None;
    for (idx, (prov, model)) in chain.iter().enumerate() {
        let mut req = request.clone();
        req.model = model.clone();
        match prov.chat_stream(req).await {
            Ok(stream) => {
                if idx > 0 {
                    tracing::warn!(
                        index = idx,
                        "LLM succeeded using fallback provider in routing chain"
                    );
                }
                return Ok(stream);
            }
            Err(e) => {
                tracing::warn!(
                    index = idx,
                    error = %e,
                    "LLM provider failed; trying next in routing chain"
                );
                last_err = Some(e);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| {
        KernelError::Message("LLM routing chain exhausted (internal error)".into())
    }))
}

/// 非流式补全，按 `routing.fallback_chain` 依次尝试（与 `chat_stream_with_fallback` 相同语义）。
pub async fn chat_complete_with_fallback(
    chain: &[(Arc<OpenAiCompatibleProvider>, String)],
    request: ChatRequest,
) -> Result<String> {
    if chain.is_empty() {
        return Err(KernelError::Message(
            "LLM routing chain is empty (misconfigured)".into(),
        ));
    }
    let mut last_err: Option<KernelError> = None;
    for (idx, (prov, model)) in chain.iter().enumerate() {
        let mut req = request.clone();
        req.model = model.clone();
        match prov.chat_complete(req).await {
            Ok(text) => {
                if idx > 0 {
                    tracing::warn!(
                        index = idx,
                        "LLM (non-stream) succeeded using fallback provider in routing chain"
                    );
                }
                return Ok(text);
            }
            Err(e) => {
                tracing::warn!(
                    index = idx,
                    error = %e,
                    "LLM chat_complete failed; trying next in routing chain"
                );
                last_err = Some(e);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| {
        KernelError::Message("LLM routing chain exhausted (internal error)".into())
    }))
}
