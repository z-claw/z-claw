import { describe, it, expect } from "vitest";
import {
  appendUserLine,
  reduceTranscriptFromKernel,
  replaceTranscriptFromHistory,
  type SessionTranscript,
} from "../lib/transcript";

const SID = "session-abc";

describe("appendUserLine", () => {
  it("adds a user message to an empty session", () => {
    const result = appendUserLine({}, SID, "Hello");
    expect(result[SID]).toHaveLength(1);
    expect(result[SID][0]).toMatchObject({
      role: "user",
      text: "Hello",
      streaming: false,
    });
  });

  it("appends without mutating previous messages", () => {
    const initial = appendUserLine({}, SID, "First");
    const result = appendUserLine(initial, SID, "Second");
    expect(result[SID]).toHaveLength(2);
    expect(initial[SID]).toHaveLength(1); // no mutation
  });
});

describe("reduceTranscriptFromKernel – MessageDelta", () => {
  it("creates a new streaming assistant message on first delta", () => {
    const state: SessionTranscript = {};
    const result = reduceTranscriptFromKernel(state, {
      MessageDelta: { session_id: SID, role: "assistant", delta: "Hi" },
    });
    expect(result[SID]).toHaveLength(1);
    expect(result[SID][0]).toMatchObject({
      role: "assistant",
      text: "Hi",
      streaming: true,
    });
  });

  it("accumulates deltas on the last streaming assistant message", () => {
    let state: SessionTranscript = {};
    state = reduceTranscriptFromKernel(state, {
      MessageDelta: { session_id: SID, role: "assistant", delta: "A" },
    });
    state = reduceTranscriptFromKernel(state, {
      MessageDelta: { session_id: SID, role: "assistant", delta: "B" },
    });
    expect(result(state).text).toBe("AB");
  });
});

describe("reduceTranscriptFromKernel – MessageComplete", () => {
  it("replaces the last assistant message with the full text and ends streaming", () => {
    let state: SessionTranscript = {};
    state = reduceTranscriptFromKernel(state, {
      MessageDelta: { session_id: SID, role: "assistant", delta: "partial" },
    });
    state = reduceTranscriptFromKernel(state, {
      MessageComplete: {
        session_id: SID,
        role: "assistant",
        full_text: "complete text",
      },
    });
    expect(result(state).text).toBe("complete text");
    expect(result(state).streaming).toBe(false);
  });
});

describe("reduceTranscriptFromKernel – ToolCallStarted", () => {
  it("stops streaming on last assistant msg and appends a tool_call row", () => {
    let state: SessionTranscript = {};
    state = reduceTranscriptFromKernel(state, {
      MessageDelta: { session_id: SID, role: "assistant", delta: "text" },
    });
    state = reduceTranscriptFromKernel(state, {
      ToolCallStarted: { session_id: SID, tool_name: "execute_command" },
    });
    const msgs = state[SID];
    expect(msgs[0].streaming).toBe(false);
    expect(msgs[1]).toMatchObject({
      role: "tool_call",
      text: "execute_command",
      toolRunning: true,
    });
  });
});

describe("reduceTranscriptFromKernel – ToolCallFinished", () => {
  it("marks the tool_call row as complete", () => {
    let state: SessionTranscript = {};
    state = reduceTranscriptFromKernel(state, {
      ToolCallStarted: { session_id: SID, tool_name: "my_tool" },
    });
    state = reduceTranscriptFromKernel(state, {
      ToolCallFinished: {
        session_id: SID,
        tool_name: "my_tool",
        ok: true,
        summary: "done",
      },
    });
    const tool = state[SID].find((m) => m.role === "tool_call");
    expect(tool?.toolRunning).toBe(false);
    expect(tool?.toolOk).toBe(true);
  });

  it("marks the tool_call row as failed when ok is false", () => {
    let state: SessionTranscript = {};
    state = reduceTranscriptFromKernel(state, {
      ToolCallStarted: { session_id: SID, tool_name: "bad_tool" },
    });
    state = reduceTranscriptFromKernel(state, {
      ToolCallFinished: { session_id: SID, tool_name: "bad_tool", ok: false },
    });
    const tool = state[SID].find((m) => m.role === "tool_call");
    expect(tool?.toolOk).toBe(false);
    expect(tool?.toolRunning).toBe(false);
  });
});

describe("replaceTranscriptFromHistory", () => {
  it("replaces session messages from history rows", () => {
    const state = replaceTranscriptFromHistory({}, SID, [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(state[SID]).toHaveLength(2);
    expect(state[SID][0]).toMatchObject({ role: "user", text: "hi" });
    expect(state[SID][1]).toMatchObject({
      role: "assistant",
      text: "hello",
      streaming: false,
    });
  });

  it("preserves other session state when replacing one session", () => {
    const other = appendUserLine({}, "other-session", "data");
    const result = replaceTranscriptFromHistory(other, SID, []);
    expect(result["other-session"]).toHaveLength(1);
    expect(result[SID]).toHaveLength(0);
  });
});

// Helper to get the last assistant message in the test session.
function result(state: SessionTranscript) {
  const msgs = state[SID] ?? [];
  return msgs[msgs.length - 1];
}
