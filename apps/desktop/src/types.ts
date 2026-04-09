import { summarizeKernelEvent } from "@/lib/kernel-display";

export type KernelEventPayload = Record<string, unknown>;

export type LogEntry = {
  id: string;
  at: number;
  payload: KernelEventPayload;
  summary: ReturnType<typeof summarizeKernelEvent>;
};

export type SessionRow = { id: string; title: string };

export type McpServerRow = { server_id: string; tool_names: string[] };

export type ScheduleJobRow = {
  id: string;
  cron_expr: string;
  timezone: string;
  enabled: boolean;
  prompt_preview: string;
};

export type HealthCheckItemRow = {
  id: string;
  ok: boolean;
  detail: string;
};

export type AuditRecordRow = {
  timestamp_ms: number;
  kind: string;
  message: string;
};

export type PolicyBlockRow = {
  at: number;
  code: string;
  message: string;
};
