import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  Copy,
  FileDown,
  Layers,
  Settings2,
  MessageSquare,
  Network,
  Radio,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  Users,
} from "lucide-react";
import { toast, Toaster } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type KernelTone,
  parseSwarmTasks,
  summarizeKernelEvent,
} from "@/lib/kernel-display";
import {
  downloadTextFile,
  transcriptToMarkdown,
} from "@/lib/export-markdown";
import {
  appendUserLine,
  reduceTranscriptFromKernel,
  type SessionTranscript,
} from "@/lib/transcript";
import { loadUiPrefs, saveUiPrefs, type FeedTab } from "@/lib/ui-prefs";

import "./App.css";

type KernelEventPayload = Record<string, unknown>;

type LogEntry = {
  id: string;
  at: number;
  payload: KernelEventPayload;
  summary: ReturnType<typeof summarizeKernelEvent>;
};

type SessionRow = { id: string; title: string };

type McpServerRow = { server_id: string; tool_names: string[] };

type ScheduleJobRow = {
  id: string;
  cron_expr: string;
  timezone: string;
  enabled: boolean;
  prompt_preview: string;
};

type HealthCheckItemRow = {
  id: string;
  ok: boolean;
  detail: string;
};

type AuditRecordRow = {
  timestamp_ms: number;
  kind: string;
  message: string;
};

type PolicyBlockRow = {
  at: number;
  code: string;
  message: string;
};

function toneBadgeClass(tone: KernelTone): string {
  const m: Record<KernelTone, string> = {
    neutral: "border-border/60 bg-muted/40 text-muted-foreground",
    success: "border-emerald-500/40 bg-emerald-950/40 text-emerald-100",
    accent: "border-primary/45 bg-primary/12 text-primary",
    warning: "border-orange-400/40 bg-orange-950/35 text-orange-100",
    danger: "border-destructive/50 bg-destructive/15 text-red-100",
  };
  return m[tone];
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function App() {
  const uiPrefs0 = useMemo(() => loadUiPrefs(), []);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [kernelReady, setKernelReady] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryBudget, setMemoryBudget] = useState("8000");
  const [schedCron, setSchedCron] = useState("");
  const [schedTz, setSchedTz] = useState("Asia/Shanghai");
  const [schedPrompt, setSchedPrompt] = useState("");
  const [schedRemoveId, setSchedRemoveId] = useState("");
  const [delTarget, setDelTarget] = useState("");
  const [delInstr, setDelInstr] = useState("");
  const [swarmText, setSwarmText] = useState("research: 调研主题\nwrite: 写一段摘要");
  const [transcripts, setTranscripts] = useState<SessionTranscript>({});
  const [mcpServers, setMcpServers] = useState<McpServerRow[]>([]);
  const [scheduleJobs, setScheduleJobs] = useState<ScheduleJobRow[]>([]);
  const [memoryPreview, setMemoryPreview] = useState<{
    sessionId: string;
    snippets: string[];
  } | null>(null);
  const [memoryForgetId, setMemoryForgetId] = useState("");
  const [feedTab, setFeedTab] = useState<FeedTab>(uiPrefs0.feedTab);
  const [inspectorTab, setInspectorTab] = useState(uiPrefs0.inspectorTab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configSnapshot, setConfigSnapshot] = useState<unknown | null>(null);
  const [healthReport, setHealthReport] = useState<{
    checked_at_ms: number;
    items: HealthCheckItemRow[];
  } | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditRecordRow[]>([]);
  const [policyTrail, setPolicyTrail] = useState<PolicyBlockRow[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const listedRef = useRef(false);
  const sessionRestoreRef = useRef<string | null>(uiPrefs0.lastSessionId);

  const send = useCallback(async (cmd: unknown) => {
    try {
      await invoke("kernel_send", { cmd });
    } catch (err) {
      const msg = String(err);
      toast.error("指令未送达内核", { description: msg });
      setLog((prev) => [
        ...prev,
        {
          id: newId(),
          at: Date.now(),
          payload: {},
          summary: {
            label: "invoke",
            detail: msg,
            tone: "danger",
          },
        },
      ]);
    }
  }, []);

  useEffect(() => {
    if (kernelReady && !listedRef.current) {
      listedRef.current = true;
      void send("ListSessions");
    }
  }, [kernelReady, send]);

  useEffect(() => {
    const want = sessionRestoreRef.current;
    if (want == null || sessions.length === 0) return;
    if (sessions.some((s) => s.id === want)) {
      setSessionId(want);
    }
    sessionRestoreRef.current = null;
  }, [sessions]);

  useEffect(() => {
    if (sessionId) {
      saveUiPrefs({ lastSessionId: sessionId });
    }
  }, [sessionId]);

  useEffect(() => {
    if (settingsOpen) {
      void send("GetConfigSnapshot");
    }
  }, [settingsOpen, send]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<KernelEventPayload>("kernel-event", (e) => {
      const payload =
        typeof e.payload === "object" && e.payload !== null
          ? (e.payload as KernelEventPayload)
          : { _: e.payload } as KernelEventPayload;

      if ("Ready" in payload) setKernelReady(true);
      if ("SessionCreated" in payload) {
        const sc = payload.SessionCreated as { id: string };
        if (sc?.id) setSessionId(sc.id);
      }
      if ("SessionsList" in payload) {
        const sl = payload.SessionsList as {
          sessions?: SessionRow[];
        };
        setSessions(sl.sessions ?? []);
      }
      if ("McpToolsUpdated" in payload) {
        const m = payload.McpToolsUpdated as { servers?: McpServerRow[] };
        setMcpServers(m.servers ?? []);
      }
      if ("ScheduleList" in payload) {
        const j = payload.ScheduleList as { jobs?: ScheduleJobRow[] };
        setScheduleJobs(j.jobs ?? []);
      }
      if ("MemoryRecalled" in payload) {
        const m = payload.MemoryRecalled as {
          session_id?: string;
          snippets?: string[];
        };
        setMemoryPreview({
          sessionId: m.session_id ?? "",
          snippets: m.snippets ?? [],
        });
      }
      if ("ConfigSnapshot" in payload) {
        const c = payload.ConfigSnapshot as { snapshot?: unknown };
        setConfigSnapshot(c.snapshot ?? null);
      }
      if ("HealthReport" in payload) {
        const h = payload.HealthReport as {
          checked_at_ms?: number;
          items?: HealthCheckItemRow[];
        };
        setHealthReport({
          checked_at_ms: h.checked_at_ms ?? 0,
          items: h.items ?? [],
        });
      }
      if ("AuditEntry" in payload) {
        const a = payload.AuditEntry as {
          record?: AuditRecordRow;
          line?: string;
        };
        if (a.record) {
          setAuditTrail((prev) => [...prev.slice(-63), a.record!]);
        } else if (a.line) {
          setAuditTrail((prev) => [
            ...prev.slice(-63),
            {
              timestamp_ms: Date.now(),
              kind: "general",
              message: a.line!,
            },
          ]);
        }
      }
      if ("PolicyBlocked" in payload) {
        const p = payload.PolicyBlocked as {
          code?: string;
          message?: string;
          reason?: string;
        };
        setPolicyTrail((prev) => [
          ...prev.slice(-31),
          {
            at: Date.now(),
            code: p.code ?? "other",
            message: p.message ?? p.reason ?? "",
          },
        ]);
      }

      setTranscripts((prev) => reduceTranscriptFromKernel(prev, payload));

      setLog((prev) => [
        ...prev.slice(-400),
        {
          id: newId(),
          at: Date.now(),
          payload,
          summary: summarizeKernelEvent(payload),
        },
      ]);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      void unlisten?.();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, sessionId]);

  const selectSession = (id: string) => {
    setSessionId(id);
  };

  const sendMessage = () => {
    const t = messageDraft.trim();
    if (!sessionId || !t) return;
    setTranscripts((prev) => appendUserLine(prev, sessionId, t));
    void send({
      SendMessage: { session_id: sessionId, content: t },
    });
    setMessageDraft("");
  };

  const recallMemory = () => {
    if (!sessionId || !memoryQuery.trim()) return;
    const budget = Number.parseInt(memoryBudget, 10) || 8000;
    void send({
      MemoryRecall: {
        session_id: sessionId,
        query: memoryQuery,
        budget_tokens: budget,
      },
    });
  };

  const addSchedule = () => {
    if (!schedCron.trim() || !schedTz.trim() || !schedPrompt.trim()) return;
    void send({
      ScheduleAdd: {
        cron_expr: schedCron,
        timezone: schedTz,
        payload: {
          prompt: schedPrompt,
          target_session_id: sessionId,
        },
      },
    });
  };

  const removeSchedule = () => {
    const id = schedRemoveId.trim();
    if (!id) return;
    void send({ ScheduleRemove: { job_id: id } });
  };

  const runDelegate = () => {
    if (!sessionId || !delTarget.trim() || !delInstr.trim()) return;
    void send({
      Delegate: {
        session_id: sessionId,
        target_agent_id: delTarget,
        instruction: delInstr,
      },
    });
  };

  const runSwarm = () => {
    if (!sessionId) return;
    const tasks = parseSwarmTasks(swarmText);
    if (tasks.length === 0) return;
    void send({ RunSwarm: { session_id: sessionId, tasks } });
  };

  const forgetMemory = () => {
    const id = memoryForgetId.trim();
    if (!id) return;
    void send({ MemoryForget: { entry_id: id } });
    setMemoryForgetId("");
  };

  const copySessionId = async () => {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
      toast.success("已复制会话 ID");
    } catch {
      toast.error("复制失败");
    }
  };

  const linesForSession = sessionId ? transcripts[sessionId] ?? [] : [];

  const exportTranscriptMd = () => {
    if (!sessionId || linesForSession.length === 0) {
      toast.message("无可导出内容", {
        description: "先选会话并在「对话」里产生消息。",
      });
      return;
    }
    const md = transcriptToMarkdown(sessionId, linesForSession);
    const short = sessionId.replace(/-/g, "").slice(0, 8);
    downloadTextFile(`z-claw-${short}-${Date.now()}.md`, md);
    toast.success("已下载 Markdown");
  };

  const copyConfigJson = async () => {
    if (configSnapshot == null) {
      toast.error("尚无快照", { description: "请先打开设置并等待刷新。" });
      return;
    }
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(configSnapshot, null, 2),
      );
      toast.success("已复制 JSON");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="vault-bg flex min-h-svh flex-col">
      <header className="vault-enter border-b border-border/50 bg-card/30 px-5 py-4 backdrop-blur-md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-baseline gap-3">
              <h1 className="font-heading text-lg font-semibold tracking-[0.35em] text-primary">
                Z-CLAW
              </h1>
              <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                agent console
              </span>
            </div>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              本地内核 · Tauri 壳 · 事件流与工具台同屏。排版取「工业简报」：高对比标签、等宽信息层。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 border font-mono text-[10px] tracking-wider uppercase",
                kernelReady
                  ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-100"
                  : "border-border/60 text-muted-foreground",
              )}
            >
              <Radio
                className={cn(
                  "size-3",
                  kernelReady ? "text-emerald-400" : "animate-pulse",
                )}
              />
              {kernelReady ? "kernel online" : "connecting"}
            </Badge>
            <div className="flex max-w-[min(100vw-2rem,320px)] items-center gap-1">
              <Badge
                variant="outline"
                className="min-w-0 flex-1 truncate border-border/60 bg-muted/30 font-mono text-[10px] text-muted-foreground"
              >
                session: {sessionId ?? "—"}
              </Badge>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground"
                disabled={!sessionId}
                onClick={() => void copySessionId()}
                title="复制会话 ID"
              >
                <Copy className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="shrink-0 border-border/50"
                onClick={() => setSettingsOpen(true)}
                title="设置与配置快照"
              >
                <Settings2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <div
          className="vault-accent-line mt-4 h-px w-24 rounded-full bg-primary/60"
          aria-hidden
        />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(200px,240px)_1fr_minmax(280px,380px)] lg:gap-5">
        {/* 左：会话与快捷指令 */}
        <Card
          size="sm"
          className="vault-enter-delay-1 flex min-h-0 flex-col border-border/40 bg-card/60 shadow-none ring-1 ring-primary/5"
        >
          <CardHeader className="border-b border-border/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase">
              <Layers className="size-4 text-primary" />
              会话
            </CardTitle>
            <CardDescription className="text-[11px] leading-snug">
              创建、切换会话；右侧发送前须选定会话。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 pt-4">
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                className="justify-start gap-2 font-mono text-xs"
                onClick={() => send({ CreateSession: { title: "chat" } })}
              >
                <Sparkles className="size-3.5 opacity-80" />
                新建会话
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="justify-start gap-2 font-mono text-xs"
                onClick={() => send("ListSessions")}
              >
                <Activity className="size-3.5 opacity-80" />
                刷新列表
              </Button>
            </div>
            <Separator className="bg-border/40" />
            <div className="min-h-0 flex-1 space-y-1">
              <p className="mb-2 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                已缓存
              </p>
              <ScrollArea className="h-40 lg:h-52">
                <div className="flex flex-col gap-1.5 pr-3">
                  {sessions.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      暂无列表，点击「刷新列表」。
                    </p>
                  ) : (
                    sessions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectSession(s.id)}
                        className={cn(
                          "rounded-md border px-2.5 py-2 text-left transition-colors",
                          sessionId === s.id
                            ? "border-primary/50 bg-primary/10"
                            : "border-border/40 bg-muted/20 hover:bg-muted/40",
                        )}
                      >
                        <div className="truncate text-xs font-medium">
                          {s.title}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {s.id}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* 中：事件流 + 撰写 */}
        <Card
          className="vault-enter-delay-2 flex min-h-0 flex-col border-border/40 bg-card/70 shadow-none ring-1 ring-primary/5"
        >
          <CardHeader className="shrink-0 border-b border-border/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="size-4 text-primary" />
              转播
            </CardTitle>
            <CardDescription>
              「对话」按会话拼接用户与助手；「事件」为完整内核流，可展开 JSON。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-0 px-0 pb-4">
            <Tabs
              value={feedTab}
              onValueChange={(v) => {
                const t = v as FeedTab;
                setFeedTab(t);
                saveUiPrefs({ feedTab: t });
              }}
              className="flex min-h-[220px] flex-1 flex-col gap-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 px-6 pb-3">
                <TabsList variant="line" className="h-8 justify-start gap-0">
                  <TabsTrigger value="chat" className="font-mono text-xs">
                    对话
                  </TabsTrigger>
                  <TabsTrigger value="log" className="font-mono text-xs">
                    事件
                  </TabsTrigger>
                </TabsList>
                {feedTab === "log" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 font-mono text-xs text-muted-foreground"
                    disabled={log.length === 0}
                    onClick={() => setLog([])}
                  >
                    <Trash2 className="mr-1 size-3" />
                    清空
                  </Button>
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {sessionId ? `${linesForSession.length} 条` : "未选会话"}
                  </span>
                )}
              </div>
              <TabsContent
                value="chat"
                className="mt-0 min-h-0 flex-1 overflow-hidden px-0 pt-3 outline-none data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-[min(42vh,340px)] px-6">
                  <div className="space-y-3 pr-4 pb-2">
                    {!sessionId ? (
                      <Empty className="min-h-[180px] border-border/30 bg-muted/10">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <MessageSquare className="size-5 text-primary/70" />
                          </EmptyMedia>
                          <EmptyTitle>先选一个会话</EmptyTitle>
                          <EmptyDescription>
                            左侧创建或选择会话后，这里会显示该会话的消息时间线。
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : linesForSession.length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">
                        尚无消息。在下方撰写并发送即可开始。
                      </p>
                    ) : (
                      linesForSession.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-sm leading-relaxed",
                            m.role === "user"
                              ? "ml-4 border-primary/25 bg-primary/8"
                              : "mr-4 border-border/40 bg-background/50",
                          )}
                        >
                          <div className="mb-1 font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                            {m.role}
                            {m.streaming ? " · …" : ""}
                          </div>
                          <p className="whitespace-pre-wrap font-mono text-[13px] text-foreground/90">
                            {m.text || " "}
                          </p>
                        </div>
                      ))
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent
                value="log"
                className="mt-0 min-h-0 flex-1 overflow-hidden px-0 pt-3 outline-none data-[state=inactive]:hidden"
              >
                <ScrollArea className="h-[min(42vh,340px)] px-6">
                  <div className="space-y-2 pr-4 pb-2">
                    {log.length === 0 ? (
                      <Empty className="min-h-[180px] border-border/30 bg-muted/10">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Radio className="size-5 text-primary/70" />
                          </EmptyMedia>
                          <EmptyTitle>等待 kernel-event</EmptyTitle>
                          <EmptyDescription>
                            Ready、工具调用、策略拦截等会出现在此列表。
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      log.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-lg border border-border/35 bg-background/40 px-3 py-2.5"
                        >
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-mono text-[9px] tracking-widest uppercase",
                                toneBadgeClass(entry.summary.tone),
                              )}
                            >
                              {entry.summary.label}
                            </Badge>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {new Date(entry.at).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-foreground/90">
                            {entry.summary.detail}
                          </p>
                          <Collapsible className="mt-2">
                            <CollapsibleTrigger className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                              <ChevronDown className="size-3" />
                              原始 JSON
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border/30 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
                                {JSON.stringify(entry.payload, null, 2)}
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      ))
                    )}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            <Separator className="bg-border/40" />
            <div className="space-y-2 px-6">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  撰写
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    onClick={() => send("RefreshMcpTools")}
                  >
                    <Network className="size-3.5" />
                    MCP
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    onClick={() => send("ScheduleList")}
                  >
                    <CalendarClock className="size-3.5" />
                    Cron
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    onClick={() => void send("RunHealthCheck")}
                    title="健康检查"
                  >
                    <Stethoscope className="size-3.5" />
                  </Button>
                </div>
              </div>
              <Textarea
                placeholder={
                  sessionId
                    ? "输入消息，Enter+Ctrl 或点击发送…"
                    : "先创建或选择一个会话"
                }
                value={messageDraft}
                disabled={!sessionId}
                onChange={(e) => setMessageDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                className="min-h-[88px] resize-none font-mono text-sm"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sessionId || linesForSession.length === 0}
                  onClick={exportTranscriptMd}
                  className="gap-2 font-mono text-xs"
                >
                  <FileDown className="size-3.5" />
                  导出对话
                </Button>
                <Button
                  size="sm"
                  disabled={!sessionId || !messageDraft.trim()}
                  onClick={sendMessage}
                  className="gap-2 font-mono"
                >
                  <Send className="size-3.5" />
                  发送
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 右：检查器 */}
        <Card
          size="sm"
          className="vault-enter-delay-2 flex min-h-[320px] flex-col border-border/40 bg-card/60 shadow-none ring-1 ring-primary/5 lg:min-h-0"
        >
          <CardHeader className="border-b border-border/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase">
              <Users className="size-4 text-primary" />
              检查器
            </CardTitle>
            <CardDescription className="text-[11px]">
              记忆、调度、MCP、Agent；Tab 与会话偏好会记住到本机。
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 pt-4">
            <Tabs
              value={inspectorTab}
              onValueChange={(v) => {
                setInspectorTab(v);
                saveUiPrefs({ inspectorTab: v });
              }}
              className="flex h-full min-h-0 flex-col gap-3"
            >
              <TabsList variant="line" className="w-full flex-wrap justify-start gap-0">
                <TabsTrigger value="memory" className="font-mono text-xs">
                  记忆
                </TabsTrigger>
                <TabsTrigger value="schedule" className="font-mono text-xs">
                  调度
                </TabsTrigger>
                <TabsTrigger value="mcp" className="font-mono text-xs">
                  MCP
                </TabsTrigger>
                <TabsTrigger value="agents" className="font-mono text-xs">
                  Agent
                </TabsTrigger>
                <TabsTrigger value="system" className="font-mono text-xs">
                  系统
                </TabsTrigger>
              </TabsList>
              <TabsContent value="memory" className="min-h-0 flex-1 outline-none">
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
              <TabsContent value="schedule" className="min-h-0 flex-1 outline-none">
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel>Cron</FieldLabel>
                    <FieldContent>
                      <Input
                        value={schedCron}
                        onChange={(e) => setSchedCron(e.target.value)}
                        placeholder="0 9 * * *"
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
                              <Badge
                                variant="secondary"
                                className="text-[9px]"
                              >
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
              <TabsContent value="mcp" className="min-h-0 flex-1 outline-none">
                {mcpServers.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    尚无缓存。在转播区点「MCP」向内核请求{" "}
                    <code className="font-mono text-[10px]">RefreshMcpTools</code>
                    。
                  </p>
                ) : (
                  <Accordion multiple className="w-full">
                    {mcpServers.map((s) => (
                      <AccordionItem key={s.server_id} value={s.server_id}>
                        <AccordionTrigger className="py-2.5 font-mono text-xs hover:no-underline">
                          <span className="truncate">{s.server_id}</span>
                          <Badge variant="outline" className="ml-2 shrink-0 font-mono text-[9px]">
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
              <TabsContent value="agents" className="min-h-0 flex-1 outline-none">
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
              <TabsContent value="system" className="min-h-0 flex-1 outline-none">
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
                    onClick={() => void send("RunHealthCheck")}
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
                                  it.ok
                                    ? "text-emerald-400"
                                    : "text-destructive"
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
                              <p className="mt-1 text-foreground/90">{p.message}</p>
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
          </CardContent>
        </Card>
      </div>
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-border/40 bg-card/95 sm:max-w-md"
        >
          <SheetHeader className="space-y-1 border-b border-border/30 pb-4 text-left">
            <SheetTitle className="font-heading">设置</SheetTitle>
            <SheetDescription className="text-[11px] leading-relaxed">
              内核有效配置的只读快照（无 API 密钥，仅 env
              变量名）。修改请编辑系统配置目录下的{" "}
              <code className="font-mono text-[10px]">config.json</code>{" "}
              后重启应用。
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-wrap gap-2 py-3">
            <Button
              size="sm"
              variant="secondary"
              className="font-mono text-xs"
              onClick={() => void send("GetConfigSnapshot")}
            >
              刷新快照
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs"
              onClick={() => void send("RunHealthCheck")}
            >
              <Stethoscope className="mr-1 size-3.5" />
              运行自检
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs"
              onClick={() => void copyConfigJson()}
              disabled={configSnapshot == null}
            >
              复制 JSON
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <pre className="whitespace-pre-wrap break-all rounded-md border border-border/35 bg-muted/25 p-3 font-mono text-[10px] leading-relaxed text-foreground/90">
              {configSnapshot == null
                ? "打开本面板时会自动请求快照…"
                : JSON.stringify(configSnapshot, null, 2)}
            </pre>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <Toaster theme="dark" richColors position="top-center" />
    </div>
  );
}
