/** 将 Rust `KernelEvent` 的 JSON（externally tagged）转为可读摘要 */

export type KernelTone = "neutral" | "success" | "accent" | "warning" | "danger";

export function summarizeKernelEvent(payload: Record<string, unknown>): {
  label: string;
  detail: string;
  tone: KernelTone;
} {
  const key = Object.keys(payload)[0];
  const raw = key ? payload[key] : undefined;

  switch (key) {
    case "Ready":
      return {
        label: "就绪",
        detail: "内核已可接受指令",
        tone: "success",
      };
    case "Error": {
      const v = raw as { message?: string } | undefined;
      return {
        label: "错误",
        detail: v?.message ?? JSON.stringify(raw),
        tone: "danger",
      };
    }
    case "SessionCreated": {
      const v = raw as { id: string; title?: string };
      return {
        label: "会话",
        detail: `${v.title ?? "无题"} · ${v.id}`,
        tone: "accent",
      };
    }
    case "SessionsList": {
      const v = raw as { sessions?: unknown[] };
      const n = v.sessions?.length ?? 0;
      return { label: "会话列表", detail: `${n} 条`, tone: "neutral" };
    }
    case "SessionHistoryLoaded": {
      const v = raw as {
        messages?: unknown[];
        session_id?: string;
        client_request_id?: number;
      };
      const n = v.messages?.length ?? 0;
      const rid =
        v.client_request_id != null ? ` · req ${v.client_request_id}` : "";
      return {
        label: "历史",
        detail: `已加载 ${n} 条 · ${v.session_id?.slice(0, 8) ?? "?"}…${rid}`,
        tone: "accent",
      };
    }
    case "SessionRenamed": {
      const v = raw as { session_id?: string; title?: string };
      return {
        label: "会话",
        detail: `已重命名 · ${v.title ?? ""}`,
        tone: "accent",
      };
    }
    case "SessionDeleted": {
      const v = raw as { session_id?: string };
      return {
        label: "会话",
        detail: `已删除 ${v.session_id?.slice(0, 8) ?? "?"}…`,
        tone: "warning",
      };
    }
    case "MessageDelta": {
      const v = raw as { delta?: string; role?: string };
      return {
        label: "流式",
        detail: `${v.role ?? "?"} · ${(v.delta ?? "").slice(0, 120)}${(v.delta?.length ?? 0) > 120 ? "…" : ""}`,
        tone: "neutral",
      };
    }
    case "MessageComplete": {
      const v = raw as { full_text?: string; role?: string };
      return {
        label: "消息",
        detail: `${v.role ?? "?"} · ${(v.full_text ?? "").slice(0, 160)}${(v.full_text?.length ?? 0) > 160 ? "…" : ""}`,
        tone: "accent",
      };
    }
    case "ToolCallStarted": {
      const v = raw as { tool_name?: string };
      return {
        label: "工具",
        detail: `调用 ${v.tool_name ?? "?"}`,
        tone: "warning",
      };
    }
    case "ToolCallFinished": {
      const v = raw as { tool_name?: string; ok?: boolean; summary?: string };
      return {
        label: "工具",
        detail: `${v.ok ? "✓" : "✗"} ${v.tool_name ?? "?"} — ${v.summary ?? ""}`,
        tone: v.ok ? "success" : "danger",
      };
    }
    case "PolicyBlocked": {
      const v = raw as {
        code?: string;
        message?: string;
        reason?: string;
      };
      const msg = v.message ?? v.reason ?? "";
      const code = v.code ?? "other";
      return {
        label: "策略",
        detail: `${code}: ${msg}`,
        tone: "danger",
      };
    }
    case "McpToolsUpdated": {
      const v = raw as { servers?: { server_id?: string }[] };
      const n = v.servers?.length ?? 0;
      return {
        label: "MCP",
        detail: `已刷新 ${n} 个服务`,
        tone: "success",
      };
    }
    case "ScheduleJobAdded": {
      const v = raw as { job_id?: string };
      return {
        label: "调度",
        detail: `已添加 ${v.job_id ?? ""}`,
        tone: "accent",
      };
    }
    case "ScheduleJobRemoved": {
      const v = raw as { job_id?: string };
      return {
        label: "调度",
        detail: `已移除 ${v.job_id ?? ""}`,
        tone: "neutral",
      };
    }
    case "ScheduleList":
      return { label: "调度", detail: "任务列表已更新", tone: "neutral" };
    case "SwarmPartial": {
      const v = raw as { label?: string; text?: string };
      return {
        label: "Swarm",
        detail: `[${v.label ?? "?"}] ${(v.text ?? "").slice(0, 120)}`,
        tone: "neutral",
      };
    }
    case "SwarmMerged": {
      const v = raw as { text?: string };
      return {
        label: "Swarm",
        detail: `合并 · ${(v.text ?? "").slice(0, 120)}…`,
        tone: "accent",
      };
    }
    case "DelegateQueued": {
      const v = raw as { target_agent_id?: string; task_id?: string };
      return {
        label: "委派",
        detail: `→ ${v.target_agent_id ?? "?"} · ${v.task_id ?? ""}`,
        tone: "accent",
      };
    }
    case "MemoryRecalled": {
      const v = raw as { snippets?: unknown[] };
      const n = v.snippets?.length ?? 0;
      return {
        label: "记忆",
        detail: `召回 ${n} 条片段`,
        tone: "success",
      };
    }
    case "MemoryForgotten": {
      const v = raw as { entry_id?: string; removed?: boolean };
      const ok = v.removed === true;
      return {
        label: "记忆",
        detail: ok
          ? `已遗忘 ${v.entry_id ?? ""}`
          : `未找到活动条目 ${v.entry_id ?? ""}`,
        tone: ok ? "success" : "warning",
      };
    }
    case "AuditEntry": {
      const v = raw as {
        line?: string;
        record?: { kind?: string; message?: string; timestamp_ms?: number };
      };
      if (v.record?.message != null) {
        const k = v.record.kind ?? "general";
        return {
          label: `审计·${k}`,
          detail: v.record.message,
          tone: "neutral",
        };
      }
      return { label: "审计", detail: v.line ?? "", tone: "neutral" };
    }
    case "ConfigSnapshot":
      return {
        label: "配置",
        detail: "快照已更新（无密钥，仅 env 名）",
        tone: "neutral",
      };
    case "HealthReport": {
      const v = raw as {
        items?: { id: string; ok: boolean; detail: string }[];
      };
      const items = v.items ?? [];
      const failed = items.filter((i) => !i.ok);
      const ok = failed.length === 0;
      return {
        label: "自检",
        detail: ok
          ? `全部通过（${items.length} 项）`
          : `${failed.length} 项失败 / 共 ${items.length} 项`,
        tone: ok ? "success" : "warning",
      };
    }
    case "AgentProfileLoaded": {
      const v = raw as { agent_id?: string };
      return {
        label: "档案",
        detail: `已加载 ${v.agent_id ?? "?"}`,
        tone: "accent",
      };
    }
    case "AgentProfileLoadFailed": {
      const v = raw as { message?: string };
      return {
        label: "档案",
        detail: v.message ?? "加载失败",
        tone: "danger",
      };
    }
    case "AgentProfileSaved": {
      const v = raw as { agent_id?: string };
      return {
        label: "档案",
        detail: `已保存 ${v.agent_id ?? ""}`,
        tone: "success",
      };
    }
    default:
      return {
        label: key ?? "事件",
        detail: JSON.stringify(raw),
        tone: "neutral",
      };
  }
}

export function parseSwarmTasks(text: string): { label: string; instruction: string }[] {
  const out: { label: string; instruction: string }[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const u = t.startsWith("|") ? t.slice(1).trim() : t;
    const idx = u.indexOf(":");
    if (idx === -1) continue;
    const label = u.slice(0, idx).trim();
    const instruction = u.slice(idx + 1).trim();
    if (label && instruction) out.push({ label, instruction });
  }
  return out;
}
