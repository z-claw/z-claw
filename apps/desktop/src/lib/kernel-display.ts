/** 将 Rust `KernelEvent` 的 JSON（externally tagged）转为可读摘要 */

import i18n from "./i18n";

export type KernelTone = "neutral" | "success" | "accent" | "warning" | "danger";

function t(
  key: string,
  opts?: Record<string, string | number | undefined>,
): string {
  return i18n.t(key, opts as Record<string, unknown>);
}

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
        label: t("kernelDisplay.readyLabel"),
        detail: t("kernelDisplay.readyDetail"),
        tone: "success",
      };
    case "Error": {
      const v = raw as { message?: string } | undefined;
      return {
        label: t("kernelDisplay.errorLabel"),
        detail: v?.message ?? JSON.stringify(raw),
        tone: "danger",
      };
    }
    case "SessionCreated": {
      const v = raw as { id: string; title?: string };
      return {
        label: t("kernelDisplay.sessionLabel"),
        detail: t("kernelDisplay.sessionCreatedDetail", {
          title: v.title ?? t("kernelDisplay.untitled"),
          id: v.id,
        }),
        tone: "accent",
      };
    }
    case "SessionsList": {
      const v = raw as { sessions?: unknown[] };
      const n = v.sessions?.length ?? 0;
      return {
        label: t("kernelDisplay.sessionListLabel"),
        detail: t("kernelDisplay.sessionListDetail", { count: n }),
        tone: "neutral",
      };
    }
    case "SessionHistoryLoaded": {
      const v = raw as {
        messages?: unknown[];
        session_id?: string;
        client_request_id?: number;
      };
      const n = v.messages?.length ?? 0;
      const reqSuffix =
        v.client_request_id != null ? ` · req ${v.client_request_id}` : "";
      return {
        label: t("kernelDisplay.historyLabel"),
        detail: t("kernelDisplay.historyDetail", {
          count: n,
          sid: v.session_id?.slice(0, 8) ?? "?",
          reqSuffix,
        }),
        tone: "accent",
      };
    }
    case "SessionRenamed": {
      const v = raw as { session_id?: string; title?: string };
      return {
        label: t("kernelDisplay.sessionLabel"),
        detail: t("kernelDisplay.renamedDetail", { title: v.title ?? "" }),
        tone: "accent",
      };
    }
    case "SessionDeleted": {
      const v = raw as { session_id?: string };
      return {
        label: t("kernelDisplay.sessionLabel"),
        detail: t("kernelDisplay.deletedDetail", {
          sid: v.session_id?.slice(0, 8) ?? "?",
        }),
        tone: "warning",
      };
    }
    case "MessageDelta": {
      const v = raw as { delta?: string; role?: string };
      const d = v.delta ?? "";
      return {
        label: t("kernelDisplay.streamLabel"),
        detail: t("kernelDisplay.streamDetail", {
          role: v.role ?? "?",
          snippet: `${d.slice(0, 120)}${d.length > 120 ? "…" : ""}`,
        }),
        tone: "neutral",
      };
    }
    case "MessageComplete": {
      const v = raw as { full_text?: string; role?: string };
      const ft = v.full_text ?? "";
      return {
        label: t("kernelDisplay.messageLabel"),
        detail: t("kernelDisplay.messageDetail", {
          role: v.role ?? "?",
          snippet: `${ft.slice(0, 160)}${ft.length > 160 ? "…" : ""}`,
        }),
        tone: "accent",
      };
    }
    case "ToolCallStarted": {
      const v = raw as { tool_name?: string };
      return {
        label: t("kernelDisplay.toolLabel"),
        detail: t("kernelDisplay.toolCallDetail", { name: v.tool_name ?? "?" }),
        tone: "warning",
      };
    }
    case "ToolCallFinished": {
      const v = raw as { tool_name?: string; ok?: boolean; summary?: string };
      return {
        label: t("kernelDisplay.toolLabel"),
        detail: t("kernelDisplay.toolFinishedDetail", {
          mark: v.ok ? "✓" : "✗",
          name: v.tool_name ?? "?",
          summary: v.summary ?? "",
        }),
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
        label: t("kernelDisplay.policyLabel"),
        detail: t("kernelDisplay.policyDetail", { code, msg }),
        tone: "danger",
      };
    }
    case "McpToolsUpdated": {
      const v = raw as { servers?: { server_id?: string }[] };
      const n = v.servers?.length ?? 0;
      return {
        label: t("kernelDisplay.mcpLabel"),
        detail: t("kernelDisplay.mcpRefreshDetail", { count: n }),
        tone: "success",
      };
    }
    case "ScheduleJobAdded": {
      const v = raw as { job_id?: string };
      return {
        label: t("kernelDisplay.schedLabel"),
        detail: t("kernelDisplay.schedAdded", { id: v.job_id ?? "" }),
        tone: "accent",
      };
    }
    case "ScheduleJobRemoved": {
      const v = raw as { job_id?: string };
      return {
        label: t("kernelDisplay.schedLabel"),
        detail: t("kernelDisplay.schedRemoved", { id: v.job_id ?? "" }),
        tone: "neutral",
      };
    }
    case "ScheduleList":
      return {
        label: t("kernelDisplay.schedLabel"),
        detail: t("kernelDisplay.schedListUpdated"),
        tone: "neutral",
      };
    case "SwarmPartial": {
      const v = raw as { label?: string; text?: string };
      return {
        label: t("kernelDisplay.swarmLabel"),
        detail: t("kernelDisplay.swarmPartial", {
          label: v.label ?? "?",
          text: (v.text ?? "").slice(0, 120),
        }),
        tone: "neutral",
      };
    }
    case "SwarmMerged": {
      const v = raw as { text?: string };
      return {
        label: t("kernelDisplay.swarmLabel"),
        detail: t("kernelDisplay.swarmMerged", {
          text: (v.text ?? "").slice(0, 120),
        }),
        tone: "accent",
      };
    }
    case "DelegateQueued": {
      const v = raw as { target_agent_id?: string; task_id?: string };
      return {
        label: t("kernelDisplay.delegateLabel"),
        detail: t("kernelDisplay.delegateDetail", {
          target: v.target_agent_id ?? "?",
          task: v.task_id ?? "",
        }),
        tone: "accent",
      };
    }
    case "MemoryRecalled": {
      const v = raw as { snippets?: unknown[] };
      const n = v.snippets?.length ?? 0;
      return {
        label: t("kernelDisplay.memoryLabel"),
        detail: t("kernelDisplay.memoryRecallDetail", { count: n }),
        tone: "success",
      };
    }
    case "MemoryForgotten": {
      const v = raw as { entry_id?: string; removed?: boolean };
      const ok = v.removed === true;
      return {
        label: t("kernelDisplay.memoryLabel"),
        detail: ok
          ? t("kernelDisplay.memoryForgottenOk", { id: v.entry_id ?? "" })
          : t("kernelDisplay.memoryForgottenNo", { id: v.entry_id ?? "" }),
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
          label: t("kernelDisplay.auditKind", { kind: k }),
          detail: v.record.message,
          tone: "neutral",
        };
      }
      return {
        label: t("kernelDisplay.auditLabel"),
        detail: v.line ?? "",
        tone: "neutral",
      };
    }
    case "ConfigSnapshot":
      return {
        label: t("kernelDisplay.configLabel"),
        detail: t("kernelDisplay.configDetail"),
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
        label: t("kernelDisplay.healthLabel"),
        detail: ok
          ? t("kernelDisplay.healthAllOk", { count: items.length })
          : t("kernelDisplay.healthSomeFail", {
              failed: failed.length,
              total: items.length,
            }),
        tone: ok ? "success" : "warning",
      };
    }
    case "AgentProfileLoaded": {
      const v = raw as { agent_id?: string };
      return {
        label: t("kernelDisplay.agentProfileEventLabel"),
        detail: t("kernelDisplay.profileLoaded", { id: v.agent_id ?? "?" }),
        tone: "accent",
      };
    }
    case "AgentProfileLoadFailed": {
      const v = raw as { message?: string };
      return {
        label: t("kernelDisplay.agentProfileEventLabel"),
        detail: t("kernelDisplay.profileLoadFailed", {
          msg: v.message ?? t("kernelDisplay.loadFailedFallback"),
        }),
        tone: "danger",
      };
    }
    case "AgentProfileSaved": {
      const v = raw as { agent_id?: string };
      return {
        label: t("kernelDisplay.agentProfileEventLabel"),
        detail: t("kernelDisplay.profileSaved", { id: v.agent_id ?? "" }),
        tone: "success",
      };
    }
    default:
      return {
        label: key ?? t("kernelDisplay.defaultEvent"),
        detail: JSON.stringify(raw),
        tone: "neutral",
      };
  }
}

export function parseSwarmTasks(text: string): { label: string; instruction: string }[] {
  const out: { label: string; instruction: string }[] = [];
  for (const line of text.split("\n")) {
    const tline = line.trim();
    if (!tline) continue;
    const u = tline.startsWith("|") ? tline.slice(1).trim() : tline;
    const idx = u.indexOf(":");
    if (idx === -1) continue;
    const label = u.slice(0, idx).trim();
    const instruction = u.slice(idx + 1).trim();
    if (label && instruction) out.push({ label, instruction });
  }
  return out;
}
