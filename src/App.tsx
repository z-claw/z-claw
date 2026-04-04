import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./App.css";

type KernelEventPayload = Record<string, unknown>;

function App() {
  const [lines, setLines] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<KernelEventPayload>("kernel-event", (e) => {
      const payload = e.payload;
      const text = JSON.stringify(payload, null, 0);
      setLines((prev) => [...prev.slice(-500), text]);

      if (payload && typeof payload === "object" && "SessionCreated" in payload) {
        const sc = payload.SessionCreated as { id: string; title?: string };
        if (sc?.id) setSessionId(sc.id);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      void unlisten?.();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  async function send(cmd: unknown) {
    try {
      await invoke("kernel_send", { cmd });
    } catch (err) {
      setLines((p) => [...p, `invoke 错误: ${String(err)}`]);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">Z-CLAW</span>
          <span className="sub">Tauri 桌面端 · 内核 z-claw-kernel</span>
        </div>
        <div className="session-pill">会话: {sessionId ?? "未创建"}</div>
      </header>

      <div className="toolbar">
        <button
          type="button"
          onClick={() => send({ CreateSession: { title: "chat" } })}
        >
          新建会话
        </button>
        <button type="button" onClick={() => send("ListSessions")}>
          列出会话
        </button>
        <button type="button" onClick={() => send("RefreshMcpTools")}>
          刷新 MCP
        </button>
        <button type="button" onClick={() => send("ScheduleList")}>
          定时任务列表
        </button>
        <button
          type="button"
          className="primary"
          disabled={!sessionId}
          onClick={() =>
            sessionId &&
            send({
              SendMessage: {
                session_id: sessionId,
                content: "你好，来自 Tauri 前端。",
              },
            })
          }
        >
          发送测试消息
        </button>
      </div>

      <main className="log">
        {lines.length === 0 ? (
          <p className="hint">等待内核事件（kernel-event）…</p>
        ) : (
          lines.map((line, i) => (
            <pre key={`${i}-${line.slice(0, 32)}`} className="log-line">
              {line}
            </pre>
          ))
        )}
        <div ref={bottomRef} />
      </main>
    </div>
  );
}

export default App;
