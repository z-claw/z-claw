import { describe, expect, it } from "vitest";
import {
  appendUserLine,
  reduceTranscriptFromKernel,
  type SessionTranscript,
} from "./transcript";

describe("transcript", () => {
  it("appendUserLine adds a user message for the session", () => {
    const s: SessionTranscript = {};
    const next = appendUserLine(s, "sid-1", "hello");
    expect(next["sid-1"]).toHaveLength(1);
    expect(next["sid-1"]![0].role).toBe("user");
    expect(next["sid-1"]![0].text).toBe("hello");
  });

  it("reduceTranscriptFromKernel appends MessageDelta for assistant", () => {
    const s: SessionTranscript = {};
    const next = reduceTranscriptFromKernel(s, {
      MessageDelta: {
        session_id: "sid-1",
        role: "assistant",
        delta: "hi",
      },
    });
    expect(next["sid-1"]).toHaveLength(1);
    expect(next["sid-1"]![0].text).toBe("hi");
    expect(next["sid-1"]![0].streaming).toBe(true);
  });
});
