import { Stethoscope, Users } from "lucide-react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Separator } from "@workspace/ui/components/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { Textarea } from "@workspace/ui/components/textarea";

import type {
  McpServerRow,
  ScheduleJobRow,
  HealthCheckItemRow,
  AuditRecordRow,
  PolicyBlockRow,
} from "../../types";

export interface InspectorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // State from App UI prefs
  inspectorTab: string;
  setInspectorTab: (val: string) => void;
  // Values controlled by parent
  memoryQuery: string;
  setMemoryQuery: (val: string) => void;
  memoryBudget: string;
  setMemoryBudget: (val: string) => void;
  sessionId: string | null;
  recallMemory: () => void;
  memoryPreview: { sessionId: string; snippets: string[] } | null;
  memoryForgetId: string;
  setMemoryForgetId: (val: string) => void;
  forgetMemory: () => void;

  schedCron: string;
  setSchedCron: (val: string) => void;
  schedTz: string;
  setSchedTz: (val: string) => void;
  schedPrompt: string;
  setSchedPrompt: (val: string) => void;
  addSchedule: () => void;
  schedRemoveId: string;
  setSchedRemoveId: (val: string) => void;
  removeSchedule: () => void;
  scheduleJobs: ScheduleJobRow[];

  mcpServers: McpServerRow[];

  delTarget: string;
  setDelTarget: (val: string) => void;
  delInstr: string;
  setDelInstr: (val: string) => void;
  runDelegate: () => void;
  swarmText: string;
  setSwarmText: (val: string) => void;
  runSwarm: () => void;

  onRunHealthCheck: () => void;
  healthReport: { checked_at_ms: number; items: HealthCheckItemRow[] } | null;
  policyTrail: PolicyBlockRow[];
  auditTrail: AuditRecordRow[];
}

export function InspectorDrawer({
  open,
  onOpenChange,
  inspectorTab,
  setInspectorTab,
  memoryQuery,
  setMemoryQuery,
  memoryBudget,
  setMemoryBudget,
  sessionId,
  recallMemory,
  memoryPreview,
  memoryForgetId,
  setMemoryForgetId,
  forgetMemory,
  schedCron,
  setSchedCron,
  schedTz,
  setSchedTz,
  schedPrompt,
  setSchedPrompt,
  addSchedule,
  schedRemoveId,
  setSchedRemoveId,
  removeSchedule,
  scheduleJobs,
  mcpServers,
  delTarget,
  setDelTarget,
  delInstr,
  setDelInstr,
  runDelegate,
  swarmText,
  setSwarmText,
  runSwarm,
  onRunHealthCheck,
  healthReport,
  policyTrail,
  auditTrail,
}: InspectorDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full max-h-dvh w-full flex-col gap-0 border-border/50 bg-card/95 p-0 shadow-2xl sm:max-w-lg md:max-w-xl"
      >
        <SheetHeader className="shrink-0 space-y-1 border-b border-border/35 bg-card/50 px-4 py-3.5 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2.5 text-base font-semibold text-foreground">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/12 text-primary">
              <Users className="size-4" />
            </span>
            检查器
          </SheetTitle>
          <SheetDescription className="text-[11px] leading-relaxed text-muted-foreground/90">
            记忆、调度、MCP、Agent 与系统状态；所选 Tab 会保存在本机。
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background/20 px-4 pb-4 pt-3">
          <Tabs
            value={inspectorTab}
            onValueChange={setInspectorTab}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
          >
            <TabsList
              variant="line"
              className="inspector-tabs h-auto w-full shrink-0 flex-nowrap justify-start gap-0.5 overflow-x-auto rounded-lg border border-border/35 bg-muted/30 p-1"
            >
              <TabsTrigger
                value="memory"
                className="shrink-0 rounded-md px-2.5 text-xs sm:px-3"
              >
                记忆
              </TabsTrigger>
              <TabsTrigger
                value="schedule"
                className="shrink-0 rounded-md px-2.5 text-xs sm:px-3"
              >
                调度
              </TabsTrigger>
              <TabsTrigger
                value="mcp"
                className="shrink-0 rounded-md px-2.5 text-xs sm:px-3"
              >
                MCP
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="shrink-0 rounded-md px-2.5 text-xs sm:px-3"
              >
                Agent
              </TabsTrigger>
              <TabsTrigger
                value="system"
                className="shrink-0 rounded-md px-2.5 text-xs sm:px-3"
              >
                系统
              </TabsTrigger>
            </TabsList>
            
            <TabsContent
              value="memory"
              className="min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
            >
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel>检索查询</FieldLabel>
                  <FieldContent>
                    <Input
                      value={memoryQuery}
                      onChange={(e) => setMemoryQuery(e.target.value)}
                      placeholder="关键词…"
                      className="font-mono text-xs"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Token 预算</FieldLabel>
                  <FieldContent>
                    <Input
                      value={memoryBudget}
                      onChange={(e) => setMemoryBudget(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <FieldDescription>
                      请求预算；内核会按配置中的{" "}
                      <code className="font-mono text-[10px]">
                        memory.max_recall_budget_tokens
                      </code>{" "}
                      裁剪上限。
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!sessionId}
                  onClick={recallMemory}
                  className="w-full font-mono text-xs"
                >
                  召回记忆
                </Button>
                {memoryPreview &&
                  sessionId &&
                  memoryPreview.sessionId === sessionId &&
                  memoryPreview.snippets.length > 0 && (
                    <div className="rounded-md border border-border/40 bg-muted/20 p-3">
                      <p className="mb-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                        最近召回
                      </p>
                      <ScrollArea className="max-h-40">
                        <ul className="space-y-2 pr-2">
                          {memoryPreview.snippets.map((s, i) => (
                            <li
                              key={i}
                              className="whitespace-pre-wrap font-mono text-[11px] leading-snug text-foreground/85"
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </div>
                  )}
                <Separator className="bg-border/40" />
                <Field>
                  <FieldLabel>按 entry_id 遗忘</FieldLabel>
                  <FieldContent>
                    <Input
                      value={memoryForgetId}
                      onChange={(e) => setMemoryForgetId(e.target.value)}
                      placeholder="条目 ID…"
                      className="font-mono text-xs"
                    />
                    <FieldDescription>
                      知识片段首行含{" "}
                      <code className="font-mono text-[10px]">id=…</code>
                      ，可复制到此处；仅作重于{" "}
                      <code className="font-mono text-[10px]">knowledge</code>{" "}
                      表条目。
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!memoryForgetId.trim()}
                  onClick={forgetMemory}
                  className="w-full font-mono text-xs"
                >
                  遗忘条目
                </Button>
              </FieldGroup>
            </TabsContent>

            <TabsContent
              value="schedule"
              className="min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
            >
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel>Cron</FieldLabel>
                  <FieldContent>
                    <Input
                      value={schedCron}
                      onChange={(e) => setSchedCron(e.target.value)}
                      placeholder="0 0 9 * * *"
                      className="font-mono text-xs"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>时区</FieldLabel>
                  <FieldContent>
                    <Input
                      value={schedTz}
                      onChange={(e) => setSchedTz(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>提示词</FieldLabel>
                  <FieldContent>
                    <Textarea
                      value={schedPrompt}
                      onChange={(e) => setSchedPrompt(e.target.value)}
                      className="min-h-[72px] font-mono text-xs"
                    />
                  </FieldContent>
                </Field>
                <Button
                  size="sm"
                  className="w-full font-mono text-xs"
                  onClick={addSchedule}
                >
                  添加任务
                </Button>
                <Separator className="bg-border/40" />
                <Field>
                  <FieldLabel>移除任务 ID</FieldLabel>
                  <FieldContent>
                    <Input
                      value={schedRemoveId}
                      onChange={(e) => setSchedRemoveId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </FieldContent>
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full font-mono text-xs"
                  onClick={removeSchedule}
                >
                  移除
                </Button>
                <Separator className="bg-border/40" />
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  已缓存列表
                </p>
                {scheduleJobs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    点击转播区「Cron」或添加任务后更新。
                  </p>
                ) : (
                  <ScrollArea className="max-h-48">
                    <div className="space-y-2 pr-3">
                      {scheduleJobs.map((j) => (
                        <div
                          key={j.id}
                          className="rounded-md border border-border/40 bg-muted/15 px-2.5 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="max-w-full truncate font-mono text-[9px]"
                            >
                              {j.id}
                            </Badge>
                            <Badge variant="secondary" className="text-[9px]">
                              {j.enabled ? "on" : "off"}
                            </Badge>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {j.cron_expr} · {j.timezone}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11px] text-foreground/80">
                            {j.prompt_preview}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </FieldGroup>
            </TabsContent>

            <TabsContent
              value="mcp"
              className="min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
            >
              {mcpServers.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  尚无缓存。在转播区点「MCP」向内核请求{" "}
                  <code className="font-mono text-[10px]">
                    RefreshMcpTools
                  </code>
                  。
                </p>
              ) : (
                <Accordion multiple className="w-full">
                  {mcpServers.map((s) => (
                    <AccordionItem key={s.server_id} value={s.server_id}>
                      <AccordionTrigger className="py-2.5 font-mono text-xs hover:no-underline">
                        <span className="truncate">{s.server_id}</span>
                        <Badge
                          variant="outline"
                          className="ml-2 shrink-0 font-mono text-[9px]"
                        >
                          {s.tool_names.length}
                        </Badge>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-wrap gap-1.5 pb-1">
                          {s.tool_names.map((name) => (
                            <Badge
                              key={name}
                              variant="secondary"
                              className="font-mono text-[10px] font-normal"
                            >
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </TabsContent>

            <TabsContent
              value="agents"
              className="min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
            >
              <FieldGroup className="gap-4">
                <Field>
                  <FieldTitle className="text-primary/90">委派</FieldTitle>
                  <FieldDescription>目标 agent 与指令</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Agent ID</FieldLabel>
                  <FieldContent>
                    <Input
                      value={delTarget}
                      onChange={(e) => setDelTarget(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>指令</FieldLabel>
                  <FieldContent>
                    <Textarea
                      value={delInstr}
                      onChange={(e) => setDelInstr(e.target.value)}
                      className="min-h-[72px] font-mono text-xs"
                    />
                  </FieldContent>
                </Field>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!sessionId}
                  onClick={runDelegate}
                  className="w-full font-mono text-xs"
                >
                  提交委派
                </Button>
                <Separator className="bg-border/40" />
                <Field>
                  <FieldTitle className="text-primary/90">Swarm</FieldTitle>
                  <FieldDescription>
                    每行 <code className="text-[10px]">label: 指令</code>
                  </FieldDescription>
                </Field>
                <Textarea
                  value={swarmText}
                  onChange={(e) => setSwarmText(e.target.value)}
                  className="min-h-[100px] font-mono text-[11px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sessionId}
                  onClick={runSwarm}
                  className="w-full font-mono text-xs"
                >
                  运行 Swarm
                </Button>
              </FieldGroup>
            </TabsContent>

            <TabsContent
              value="system"
              className="min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
            >
              <FieldGroup className="gap-4">
                <Field>
                  <FieldTitle className="text-primary/90">健康检查</FieldTitle>
                  <FieldDescription>
                    对标 OpenClaw <code className="text-[10px]">doctor</code>
                    ：配置、Provider、数据目录、MCP。CLI：{" "}
                    <code className="font-mono text-[10px]">
                      z-claw-cli doctor
                    </code>
                  </FieldDescription>
                </Field>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full font-mono text-xs"
                  onClick={onRunHealthCheck}
                >
                  <Stethoscope className="mr-1 size-3.5" />
                  运行自检
                </Button>
                {healthReport && (
                  <div className="rounded-md border border-border/40 bg-muted/15 p-3">
                    <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                      checked_at_ms={healthReport.checked_at_ms}
                    </p>
                    <ScrollArea className="max-h-52">
                      <ul className="space-y-2 pr-2">
                        {healthReport.items.map((it) => (
                          <li
                            key={`${it.id}-${it.detail.slice(0, 24)}`}
                            className="font-mono text-[11px] leading-snug"
                          >
                            <span
                              className={
                                it.ok ? "text-emerald-400" : "text-destructive"
                              }
                            >
                              [{it.ok ? "OK" : "FAIL"}]
                            </span>{" "}
                            <span className="text-foreground/90">{it.id}</span>
                            <span className="block pl-4 text-muted-foreground">
                              {it.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </div>
                )}
                <Separator className="bg-border/40" />
                <Field>
                  <FieldTitle>策略拦截</FieldTitle>
                  <FieldDescription>
                    最近记录；完整说明见{" "}
                    <code className="font-mono text-[10px]">
                      docs/policy-and-audit.md
                    </code>
                  </FieldDescription>
                </Field>
                {policyTrail.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    尚无 PolicyBlocked 事件。
                  </p>
                ) : (
                  <ScrollArea className="max-h-36">
                    <ul className="space-y-2 pr-2">
                      {policyTrail
                        .slice()
                        .reverse()
                        .map((p, i) => (
                          <li
                            key={`${p.at}-${i}`}
                            className="rounded border border-destructive/25 bg-destructive/5 px-2 py-1.5 font-mono text-[10px] leading-snug"
                          >
                            <span className="text-destructive">{p.code}</span>
                            <span className="ml-2 text-muted-foreground">
                              {new Date(p.at).toLocaleTimeString()}
                            </span>
                            <p className="mt-1 text-foreground/90">
                              {p.message}
                            </p>
                          </li>
                        ))}
                    </ul>
                  </ScrollArea>
                )}
                <Separator className="bg-border/40" />
                <Field>
                  <FieldTitle>审计</FieldTitle>
                  <FieldDescription>
                    工具允许/策略与调度相关审计行（内核环形缓冲刷出）。
                  </FieldDescription>
                </Field>
                {auditTrail.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    等待 AuditEntry 事件…
                  </p>
                ) : (
                  <ScrollArea className="max-h-40">
                    <ul className="space-y-1.5 pr-2">
                      {auditTrail
                        .slice()
                        .reverse()
                        .map((r, i) => (
                          <li
                            key={`${r.timestamp_ms}-${i}`}
                            className="font-mono text-[10px] leading-snug text-foreground/85"
                          >
                            <span className="text-muted-foreground">
                              [{r.kind}]
                            </span>{" "}
                            {r.message}
                          </li>
                        ))}
                    </ul>
                  </ScrollArea>
                )}
              </FieldGroup>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
