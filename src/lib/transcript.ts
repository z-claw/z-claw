/** 按会话累积 MessageDelta / MessageComplete，供「对话」视图使用 */

export type TranscriptMsg = {
  id: string;
  sessionId: string;
  role: string;
  text: string;
  /** 仅 assistant：流式进行中，遇 ToolCallStarted 或 MessageComplete 会置 false */
  streaming?: boolean;
};

export type SessionTranscript = Record<string, TranscriptMsg[]>;

function nid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/** 用户发送（乐观追加） */
export function appendUserLine(
  bySession: SessionTranscript,
  sessionId: string,
  text: string,
): SessionTranscript {
  const list = bySession[sessionId] ?? [];
  return {
    ...bySession,
    [sessionId]: [
      ...list,
      {
        id: nid(),
        sessionId,
        role: "user",
        text,
        streaming: false,
      },
    ],
  };
}

/** 根据内核事件更新对话（按 session 分桶） */
export function reduceTranscriptFromKernel(
  bySession: SessionTranscript,
  payload: Record<string, unknown>,
): SessionTranscript {
  const key = Object.keys(payload)[0];

  if (key === "ToolCallStarted") {
    const v = payload.ToolCallStarted as { session_id?: string };
    const sid = v.session_id;
    if (!sid) return bySession;
    const list = bySession[sid] ?? [];
    const last = list[list.length - 1];
    if (last?.role === "assistant" && last.streaming) {
      return {
        ...bySession,
        [sid]: [...list.slice(0, -1), { ...last, streaming: false }],
      };
    }
    return bySession;
  }

  if (key === "MessageDelta") {
    const v = payload.MessageDelta as {
      session_id?: string;
      role?: string;
      delta?: string;
    };
    const sid = v.session_id;
    const role = v.role ?? "assistant";
    const delta = v.delta ?? "";
    if (!sid) return bySession;
    const list = bySession[sid] ?? [];
    const last = list[list.length - 1];
    if (
      last &&
      last.role === role &&
      role === "assistant" &&
      last.streaming
    ) {
      return {
        ...bySession,
        [sid]: [
          ...list.slice(0, -1),
          { ...last, text: last.text + delta },
        ],
      };
    }
    return {
      ...bySession,
      [sid]: [
        ...list,
        {
          id: nid(),
          sessionId: sid,
          role,
          text: delta,
          streaming: role === "assistant",
        },
      ],
    };
  }

  if (key === "MessageComplete") {
    const v = payload.MessageComplete as {
      session_id?: string;
      role?: string;
      full_text?: string;
    };
    const sid = v.session_id;
    const role = v.role ?? "assistant";
    const full = v.full_text ?? "";
    if (!sid) return bySession;
    const list = bySession[sid] ?? [];
    const last = list[list.length - 1];
    if (last && last.role === role) {
      return {
        ...bySession,
        [sid]: [
          ...list.slice(0, -1),
          { ...last, text: full, streaming: false },
        ],
      };
    }
    return {
      ...bySession,
      [sid]: [
        ...list,
        {
          id: nid(),
          sessionId: sid,
          role,
          text: full,
          streaming: false,
        },
      ],
    };
  }

  return bySession;
}
