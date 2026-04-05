import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  CalendarClock,
  ChevronDown,
  FileDown,
  Layers,
  MessageSquare,
  Network,
  Radio,
  RotateCw,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  Users,
} from "lucide-react";
import { toast, Toaster } from "sonner";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Separator } from "@workspace/ui/components/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import {
  type KernelTone,
  parseSwarmTasks,
  summarizeKernelEvent,
} from "@/lib/kernel-display";
import { downloadTextFile, transcriptToMarkdown } from "@/lib/export-markdown";
import {
  appendUserLine,
  reduceTranscriptFromKernel,
  replaceTranscriptFromHistory,
  type SessionTranscript,
} from "@/lib/transcript";
import { loadUiPrefs, saveUiPrefs, type FeedTab } from "@/lib/ui-prefs";
import { TitleBar } from "@/components/TitleBar";

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
  const [swarmText, setSwarmText] = useState(
    "research: 调研主题\nwrite: 写一段摘要",
  );
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [configSnapshot, setConfigSnapshot] = useState<unknown | null>(null);
  const [healthReport, setHealthReport] = useState<{
    checked_at_ms: number;
    items: HealthCheckItemRow[];
  } | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditRecordRow[]>([]);
  const [policyTrail, setPolicyTrail] = useState<PolicyBlockRow[]>([]);
  const [sessionRenameDraft, setSessionRenameDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const listedRef = useRef(false);
  const sessionRestoreRef = useRef<string | null>(uiPrefs0.lastSessionId);
  const sessionIdRef = useRef<string | null>(null);
  /** 与 LoadSessionHistory / SessionHistoryLoaded 对齐，丢弃过期历史包。发送用户消息时递增以作废在途 load。 */
  const historyRequestIdRef = useRef(0);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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

  const loadSessionHistory = useCallback(
    (sid: string) => {
      const rid = ++historyRequestIdRef.current;
      void send({
        LoadSessionHistory: {
          session_id: sid,
          limit: 200,
          client_request_id: rid,
        },
      });
    },
    [send],
  );

  useEffect(() => {
    if (!kernelReady || !sessionId) return;
    loadSessionHistory(sessionId);
  }, [kernelReady, sessionId, loadSessionHistory]);

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
    if (!sessionId) {
      setSessionRenameDraft("");
      return;
    }
    const s = sessions.find((x) => x.id === sessionId);
    setSessionRenameDraft(s?.title ?? "");
  }, [sessionId, sessions]);

  useEffect(() => {
    if (settingsOpen && kernelReady) {
      void send("GetConfigSnapshot");
    }
  }, [settingsOpen, kernelReady, send]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<KernelEventPayload>(
      "kernel-event",
      (e: Event<KernelEventPayload>) => {
        const payload =
          typeof e.payload === "object" && e.payload !== null
            ? (e.payload as KernelEventPayload)
            : ({ _: e.payload } as KernelEventPayload);

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
        if ("SessionHistoryLoaded" in payload) {
          const v = payload.SessionHistoryLoaded as {
            session_id?: string;
            client_request_id?: number;
            messages?: { role: string; content: string }[];
          };
          const sid = v.session_id;
          const msgs = v.messages;
          const rid = v.client_request_id ?? 0;
          if (
            sid &&
            Array.isArray(msgs) &&
            sessionIdRef.current === sid &&
            rid === historyRequestIdRef.current
          ) {
            setTranscripts((prev) =>
              replaceTranscriptFromHistory(prev, sid, msgs),
            );
          }
        }
        if ("SessionRenamed" in payload) {
          const v = payload.SessionRenamed as {
            session_id?: string;
            title?: string;
          };
          if (v.session_id != null && v.title != null) {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === v.session_id ? { ...s, title: v.title! } : s,
              ),
            );
          }
        }
        if ("SessionDeleted" in payload) {
          const v = payload.SessionDeleted as { session_id?: string };
          const sid = v.session_id;
          if (sid) {
            setSessions((prev) => prev.filter((s) => s.id !== sid));
            setTranscripts((prev) => {
              const n = { ...prev };
              delete n[sid];
              return n;
            });
            setSessionId((cur) => {
              if (cur === sid) {
                saveUiPrefs({ lastSessionId: null });
                return null;
              }
              return cur;
            });
            setDeleteConfirmId((d) => (d === sid ? null : d));
          }
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
        if ("MemoryForgotten" in payload) {
          const m = payload.MemoryForgotten as {
            entry_id?: string;
            removed?: boolean;
          };
          if (m.removed === true) {
            toast.success("已遗忘知识条目", {
              description: m.entry_id ?? "",
            });
          } else {
            toast.message("未找到可遗忘条目", {
              description: m.entry_id ?? "请检查 ID 或条目已删除",
            });
          }
        }
        if ("ConfigSnapshot" in payload) {
          const c = payload.ConfigSnapshot as { snapshot?: unknown };
          const snap = c.snapshot ?? null;
          setConfigSnapshot(snap);
          if (snap !== null && typeof snap === "object") {
            const rt = (snap as Record<string, unknown>).runtime as
              | Record<string, unknown>
              | undefined;
            const reloadErr = rt?.config_reload_error;
            if (typeof reloadErr === "string" && reloadErr.length > 0) {
              toast.error("配置热重载失败（仍显示上一份可用配置）", {
                description: reloadErr,
              });
            }
          }
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
      },
    ).then((fn: UnlistenFn) => {
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
    historyRequestIdRef.current += 1;
    setTranscripts((prev) => appendUserLine(prev, sessionId, t));
    void send({
      SendMessage: { session_id: sessionId, content: t },
    });
    setMessageDraft("");
  };

  const applySessionRename = () => {
    if (!sessionId) return;
    const title = sessionRenameDraft.trim();
    if (!title) return;
    const cur = sessions.find((s) => s.id === sessionId)?.title;
    if (title === cur) return;
    void send({ RenameSession: { session_id: sessionId, title } });
  };

  const confirmDeleteSession = () => {
    const sid = deleteConfirmId;
    if (!sid) return;
    void send({ DeleteSession: { session_id: sid } });
    setDeleteConfirmId(null);
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

  const linesForSession = sessionId ? (transcripts[sessionId] ?? []) : [];

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
    <div className="vault-bg flex h-dvh max-h-dvh flex-col overflow-hidden">
      <TitleBar
        kernelReady={kernelReady}
        sessionId={sessionId}
        onCopySessionId={() => void copySessionId()}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenInspector={() => setInspectorOpen(true)}
      />

      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(232px,272px)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-4 lg:overflow-hidden">
          {/* 左：会话与快捷指令 */}
          <Card
            size="sm"
            className="vault-enter-delay-1 app-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-none ring-0"
          >
            <CardHeader className="border-b border-border/35 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <span className="flex size-7 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <Layers className="size-4" />
                </span>
                会话
              </CardTitle>
              <CardDescription className="text-[11px] leading-relaxed text-muted-foreground/90">
                从本地 SQLite 载入历史；发送消息前请先选定会话。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-3">
              <div className="grid shrink-0 grid-cols-1 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                <Button
                  size="sm"
                  className="justify-center gap-2 text-xs sm:justify-start"
                  onClick={() => send({ CreateSession: { title: "chat" } })}
                >
                  <Sparkles className="size-3.5 opacity-80" />
                  新建会话
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-center gap-2 text-xs sm:justify-start"
                  onClick={() => send("ListSessions")}
                >
                  <Activity className="size-3.5 opacity-80" />
                  刷新列表
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-center gap-2 text-xs sm:justify-start"
                  disabled={!sessionId}
                  onClick={() => sessionId && loadSessionHistory(sessionId)}
                >
                  <RotateCw className="size-3.5 opacity-80" />
                  同步历史
                </Button>
              </div>
              <Separator className="bg-border/30" />
              <div className="shrink-0 space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  重命名当前会话
                </p>
                <div className="flex gap-1.5">
                  <Input
                    value={sessionRenameDraft}
                    onChange={(e) => setSessionRenameDraft(e.target.value)}
                    disabled={!sessionId}
                    placeholder={sessionId ? "标题" : "先选择会话"}
                    className="h-8 min-w-0 flex-1 font-mono text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applySessionRename();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0 px-2.5 text-xs"
                    disabled={
                      !sessionId ||
                      !sessionRenameDraft.trim() ||
                      sessionRenameDraft.trim() ===
                        sessions.find((x) => x.id === sessionId)?.title
                    }
                    onClick={() => applySessionRename()}
                  >
                    保存
                  </Button>
                </div>
              </div>
              <Separator className="shrink-0 bg-border/30" />
              <div className="flex min-h-0 flex-1 flex-col space-y-1">
                <p className="mb-1.5 shrink-0 text-[11px] font-medium text-muted-foreground">
                  会话列表
                </p>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex flex-col gap-1.5 pr-3">
                    {sessions.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/35 bg-muted/15 px-3 py-6 text-center text-[11px] text-muted-foreground">
                        暂无会话，可先点「刷新列表」。
                      </p>
                    ) : (
                      sessions.map((s) => (
                        <div
                          key={s.id}
                          className={cn(
                            "flex items-stretch gap-0.5 rounded-lg border transition-all",
                            sessionId === s.id
                              ? "border-primary/35 bg-primary/[0.08] shadow-[inset_3px_0_0_0_var(--primary)]"
                              : "border-border/30 bg-muted/15 hover:border-border/45 hover:bg-muted/30",
                          )}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 px-3 py-2.5 text-left"
                            onClick={() => selectSession(s.id)}
                          >
                            <div className="truncate text-sm font-medium leading-tight">
                              {s.title}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                              {s.id}
                            </div>
                          </button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="mt-1 mr-1 shrink-0 text-muted-foreground hover:text-destructive"
                            title="删除会话"
                            onClick={() => setDeleteConfirmId(s.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          {/* 中：事件流 + 撰写 */}
          <Card className="vault-enter-delay-2 app-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-none ring-0">
            <CardHeader className="shrink-0 border-b border-border/35 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <span className="flex size-7 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <MessageSquare className="size-4" />
                </span>
                转播台
              </CardTitle>
              <CardDescription className="text-[11px] leading-relaxed text-muted-foreground/90">
                对话视图按会话拼接消息；事件视图为内核完整事件流，可展开 JSON。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-0 pb-3">
              <Tabs
                value={feedTab}
                onValueChange={(v) => {
                  const t = v as FeedTab;
                  setFeedTab(t);
                  saveUiPrefs({ feedTab: t });
                }}
                className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
              >
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/30 px-4 pb-2.5 sm:px-5">
                  <TabsList
                    variant="line"
                    className="h-9 justify-start gap-0.5 rounded-lg bg-muted/30 p-1"
                  >
                    <TabsTrigger
                      value="chat"
                      className="rounded-md px-3 text-xs"
                    >
                      对话
                    </TabsTrigger>
                    <TabsTrigger
                      value="log"
                      className="rounded-md px-3 text-xs"
                    >
                      事件
                    </TabsTrigger>
                  </TabsList>
                  {feedTab === "log" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      disabled={log.length === 0}
                      onClick={() => setLog([])}
                    >
                      <Trash2 className="mr-1 size-3" />
                      清空
                    </Button>
                  ) : (
                    <span className="rounded-md bg-muted/35 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {sessionId ? `${linesForSession.length} 条` : "未选会话"}
                    </span>
                  )}
                </div>
                <TabsContent
                  value="chat"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-0 pt-3 outline-none data-[state=inactive]:hidden"
                >
                  <ScrollArea className="min-h-0 flex-1 px-4 sm:px-5">
                    <div className="space-y-3 pr-4 pb-2">
                      {!sessionId ? (
                        <Empty className="min-h-[200px] border-border/30 bg-muted/12">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <MessageSquare className="size-5 text-primary/70" />
                            </EmptyMedia>
                            <EmptyTitle>先选一个会话</EmptyTitle>
                            <EmptyDescription>
                              在左侧创建或选择会话后，这里会显示该会话的消息时间线。
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : linesForSession.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border/30 bg-muted/10 py-10 text-center text-xs text-muted-foreground">
                          尚无消息。在下方输入并发送即可开始。
                        </p>
                      ) : (
                        linesForSession.map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              "relative rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed",
                              m.role === "user"
                                ? "ml-3 border-primary/22 bg-primary/[0.07] before:absolute before:inset-y-2 before:-left-2 before:w-0.5 before:rounded-full before:bg-primary/65"
                                : "mr-3 border-border/35 bg-card/55 before:absolute before:inset-y-2 before:-right-2 before:w-0.5 before:rounded-full before:bg-muted-foreground/30",
                            )}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {m.role === "user" ? "你" : "助手"}
                              </span>
                              {m.streaming ? (
                                <span className="font-mono text-[9px] text-primary/80">
                                  输出中…
                                </span>
                              ) : null}
                            </div>
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/92">
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
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-0 pt-3 outline-none data-[state=inactive]:hidden"
                >
                  <ScrollArea className="min-h-0 flex-1 px-4 sm:px-5">
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
              <Separator className="shrink-0 bg-border/30" />
              <div className="shrink-0 space-y-2.5 rounded-b-[inherit] border-t border-border/25 bg-muted/12 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    撰写
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => send("RefreshMcpTools")}
                    >
                      <Network className="size-3.5" />
                      MCP
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => send("ScheduleList")}
                    >
                      <CalendarClock className="size-3.5" />
                      Cron
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
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
                      ? "Enter 发送 · Shift+Enter 换行"
                      : "先创建或选择一个会话"
                  }
                  value={messageDraft}
                  disabled={!sessionId}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="min-h-[88px] resize-none rounded-md border-border/40 bg-background/70 text-sm"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!sessionId || linesForSession.length === 0}
                    onClick={exportTranscriptMd}
                    className="gap-2 text-xs"
                  >
                    <FileDown className="size-3.5" />
                    导出对话
                  </Button>
                  <Button
                    size="sm"
                    disabled={!sessionId || !messageDraft.trim()}
                    onClick={sendMessage}
                    className="gap-2 shadow-sm"
                  >
                    <Send className="size-3.5" />
                    发送
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
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
              onValueChange={(v) => {
                setInspectorTab(v);
                saveUiPrefs({ inspectorTab: v });
              }}
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
                        知识类片段首行含{" "}
                        <code className="font-mono text-[10px]">id=…</code>
                        ，可复制到此处；仅作用于{" "}
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
                    <FieldTitle className="text-primary/90">
                      健康检查
                    </FieldTitle>
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
                              <span className="text-foreground/90">
                                {it.id}
                              </span>
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

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-border/50 bg-card/95 shadow-2xl sm:max-w-md"
        >
          <SheetHeader className="space-y-1 border-b border-border/35 bg-card/50 pb-4 text-left">
            <SheetTitle className="font-heading text-foreground">
              设置
            </SheetTitle>
            <SheetDescription className="text-[11px] leading-relaxed text-muted-foreground/90">
              只读快照（无 API 密钥明文）。请编辑下方「实际读取路径」对应的{" "}
              <code className="font-mono text-[10px]">config.json</code>
              ；打开本面板或点击「刷新快照」会从磁盘重载；发消息前也会尝试重载。
            </SheetDescription>
            {configSnapshot !== null &&
              typeof configSnapshot === "object" &&
              "config_file_path" in configSnapshot && (
                <p className="mt-2 rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-snug text-foreground/85 break-all">
                  实际读取路径：{" "}
                  {String(
                    (configSnapshot as { config_file_path?: unknown })
                      .config_file_path ?? "",
                  )}
                </p>
              )}
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
      <AlertDialog
        open={deleteConfirmId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除该会话在本地 SQLite
              中的消息与片段记录，且不可恢复。确定要继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">取消</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteSession()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster theme="dark" richColors position="top-center" />
    </div>
  );
}
