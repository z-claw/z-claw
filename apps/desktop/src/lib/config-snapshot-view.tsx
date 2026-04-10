import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";

function Row({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
}) {
  const v =
    value === null || value === undefined
      ? "—"
      : typeof value === "number" && Number.isNaN(value)
        ? "—"
        : typeof value === "boolean"
          ? value
            ? "是"
            : "否"
          : String(value);
  return (
    <div className="grid grid-cols-[minmax(0,38%)_minmax(0,62%)] gap-x-2 gap-y-0.5 text-[11px] leading-snug">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-foreground/90">{v}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-0 py-3 shadow-none ring-border/40">
      <CardHeader className="px-3 pb-2 pt-0">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-0 pt-0">{children}</CardContent>
    </Card>
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 内核 `snapshot_for_ui` + `GetConfigSnapshot` 注入的 `runtime` */
export function ConfigSnapshotStructured({
  snapshot,
}: {
  snapshot: unknown | null;
}) {
  if (snapshot == null) {
    return (
      <p className="rounded-md border border-dashed border-border/40 bg-muted/20 px-3 py-8 text-center text-[11px] text-muted-foreground">
        尚无快照，请点击「刷新快照」。
      </p>
    );
  }

  if (!isRecord(snapshot)) {
    return (
      <pre className="whitespace-pre-wrap break-all rounded-md border border-border/35 bg-muted/25 p-3 font-mono text-[10px]">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    );
  }

  const runtime = isRecord(snapshot.runtime) ? snapshot.runtime : null;
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  const mcpServers = Array.isArray(snapshot.mcp_servers)
    ? snapshot.mcp_servers
    : [];
  const routing = isRecord(snapshot.routing) ? snapshot.routing : null;
  const policy = isRecord(snapshot.policy) ? snapshot.policy : null;
  const memory = isRecord(snapshot.memory) ? snapshot.memory : null;

  return (
    <div className="flex flex-col gap-3">
      <Section title="默认">
        <div className="space-y-2">
          <Row
            label="default_provider_id"
            value={snapshot.default_provider_id as string | undefined}
          />
          <Row
            label="default_model"
            value={snapshot.default_model as string | undefined}
          />
          <Row
            label="data_dir"
            value={snapshot.data_dir as string | undefined}
          />
        </div>
      </Section>

      {runtime && (
        <Section title="运行时（快照附带）">
          <div className="space-y-2">
            {"model" in runtime && (
              <Row label="model" value={String(runtime.model ?? "")} />
            )}
            {"workspace_root" in runtime && (
              <Row
                label="workspace_root"
                value={String(runtime.workspace_root ?? "")}
              />
            )}
            {"default_mcp_server" in runtime && (
              <Row
                label="default_mcp_server"
                value={String(runtime.default_mcp_server ?? "")}
              />
            )}
            {"llm_routing_provider_ids" in runtime &&
              Array.isArray(runtime.llm_routing_provider_ids) && (
                <Row
                  label="llm_routing_provider_ids"
                  value={runtime.llm_routing_provider_ids.join(", ")}
                />
              )}
            {"config_reload_error" in runtime &&
              runtime.config_reload_error != null &&
              String(runtime.config_reload_error).length > 0 && (
                <Row
                  label="config_reload_error"
                  value={String(runtime.config_reload_error)}
                />
              )}
          </div>
        </Section>
      )}

      <Section title={`提供商 (${providers.length})`}>
        {providers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">无</p>
        ) : (
          <div className="space-y-3">
            {providers.map((p, i) => {
              if (!isRecord(p)) return null;
              return (
                <div key={`${String(p.id ?? i)}-${i}`} className="space-y-1.5">
                  {i > 0 && <Separator className="bg-border/40" />}
                  <Row label="id" value={String(p.id ?? "")} />
                  <Row label="base_url" value={String(p.base_url ?? "")} />
                  <Row label="api_key_env" value={String(p.api_key_env ?? "")} />
                  <Row
                    label="default_model"
                    value={String(p.default_model ?? "")}
                  />
                  <Row
                    label="has_inline_api_key"
                    value={Boolean(p.has_inline_api_key)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={`MCP 服务 (${mcpServers.length})`}>
        {mcpServers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">无</p>
        ) : (
          <div className="space-y-3">
            {mcpServers.map((m, i) => {
              if (!isRecord(m)) return null;
              return (
                <div key={`${String(m.id ?? i)}-${i}`} className="space-y-1.5">
                  {i > 0 && <Separator className="bg-border/40" />}
                  <Row label="id" value={String(m.id ?? "")} />
                  <Row label="command" value={String(m.command ?? "")} />
                  <Row
                    label="args"
                    value={
                      Array.isArray(m.args) ? m.args.join(" ") : String(m.args)
                    }
                  />
                  <Row label="lazy" value={Boolean(m.lazy)} />
                  <Row
                    label="tool_namespace_prefix"
                    value={
                      m.tool_namespace_prefix == null
                        ? m.tool_namespace_prefix
                        : String(m.tool_namespace_prefix)
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {routing && (
        <Section title="路由 fallback">
          <Row
            label="fallback_chain"
            value={
              Array.isArray(routing.fallback_chain)
                ? routing.fallback_chain.join(" → ")
                : ""
            }
          />
        </Section>
      )}

      {policy && (
        <Section title="策略">
          <div className="space-y-2">
            <Row
              label="allowed_path_prefixes"
              value={
                Array.isArray(policy.allowed_path_prefixes)
                  ? policy.allowed_path_prefixes.join(", ")
                  : ""
              }
            />
            <Row
              label="blocked_tool_names"
              value={
                Array.isArray(policy.blocked_tool_names)
                  ? policy.blocked_tool_names.join(", ")
                  : ""
              }
            />
            <Row
              label="min_schedule_interval_sec"
              value={Number(policy.min_schedule_interval_sec)}
            />
            <Row label="max_swarm_tasks" value={Number(policy.max_swarm_tasks)} />
          </div>
        </Section>
      )}

      {memory && (
        <Section title="记忆 / 压缩">
          <div className="space-y-2">
            <Row
              label="compaction_enabled"
              value={Boolean(memory.compaction_enabled)}
            />
            <Row
              label="compaction_message_threshold"
              value={Number(memory.compaction_message_threshold)}
            />
            <Row
              label="compaction_keep_recent"
              value={Number(memory.compaction_keep_recent)}
            />
            <Row
              label="compaction_summary_max_chars"
              value={Number(memory.compaction_summary_max_chars)}
            />
            <Row
              label="compaction_llm_summary"
              value={Boolean(memory.compaction_llm_summary)}
            />
            <Row
              label="max_recall_budget_tokens"
              value={Number(memory.max_recall_budget_tokens)}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
