import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { CalendarClock, FileDown, MessageSquare, Network, Send, Stethoscope, Trash2 } from "lucide-react";
import { toast, Toaster } from "sonner";

import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";

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
import {
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

import { Sidebar } from "./components/layout/Sidebar";
import { ChatPanel } from "./components/layout/ChatPanel";
import { EventLogPanel } from "./components/layout/EventLogPanel";
import { SettingsDrawer } from "./components/modals/SettingsDrawer";
import { InspectorDrawer } from "./components/modals/InspectorDrawer";
import { AgentProfileSheet } from "./components/modals/AgentProfileSheet";
import type {
  KernelEventPayload,
  LogEntry,
  SessionRow,
  McpServerRow,
  ScheduleJobRow,
  HealthCheckItemRow,
  AuditRecordRow,
  PolicyBlockRow,
} from "./types";

import "./App.css";





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
  const [agentsList, setAgentsList] = useState<string[]>([]);
  const [activeAgent, setActiveAgent] = useState<string>("DefaultAgent");
  const [agentProfileOpen, setAgentProfileOpen] = useState(false);
  const [agentProfileIdentity, setAgentProfileIdentity] = useState("");
  const [agentProfileMemory, setAgentProfileMemory] = useState("");
  const [agentProfileLoading, setAgentProfileLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    approval_id: string;
    session_id: string;
    tool_name: string;
    arguments_json: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const listedRef = useRef(false);
  const profileLoadReqIdRef = useRef(0);
  const sessionRestoreRef = useRef<string | null>(uiPrefs0.lastSessionId);
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId; // Update immediately during render to avoid race condition
  /** 与 LoadSessionHistory / SessionHistoryLoaded 对齐，丢弃过期历史包。发送用户消息时递增以作废在途 load。 */
  const historyRequestIdRef = useRef(0);

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

  // Initial data fetch: we wait for kernelReady to ensure event listeners are fully registered
  useEffect(() => {
    if (kernelReady && !listedRef.current) {
      listedRef.current = true;
      // eslint-disable-next-line
      void send("ListSessions");
      void send("ListAgents");
      void send("GetConfigSnapshot");
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
      // eslint-disable-next-line
      setSessionRenameDraft("");
      return;
    }
    const s = sessions.find((x) => x.id === sessionId);
     
    setSessionRenameDraft(s?.title ?? "");
  }, [sessionId, sessions]);

  useEffect(() => {
    if (settingsOpen) {
      void send("GetConfigSnapshot");
    }
  }, [settingsOpen, send]);

  useEffect(() => {
    if (!kernelReady || !agentProfileOpen || !activeAgent) return;
    const rid = ++profileLoadReqIdRef.current;
    setAgentProfileLoading(true);
    void send({
      LoadAgentProfile: {
        agent_id: activeAgent,
        client_request_id: rid,
      },
    });
  }, [kernelReady, agentProfileOpen, activeAgent, send]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<KernelEventPayload>(
      "kernel-event",
      (e: Event<KernelEventPayload>) => {
        const payload =
          typeof e.payload === "object" && e.payload !== null
            ? (e.payload as KernelEventPayload)
            : ({ _: e.payload } as KernelEventPayload);

        // 内核 Ready 可能在 Web 端 subscribe 之前就已发出，会丢失；任意一条 externally-tagged
        // 内核事件（单键且非占位 `_`）都说明通道可用，应显示「已连接」。
        {
          const k = Object.keys(payload)[0];
          if (k && k !== "_") setKernelReady(true);
        }
        if ("Error" in payload) {
          const err = payload.Error as { message?: string };
          const msg = err.message ?? "未知错误";
          toast.error("内核错误", { description: msg });
        }
        if ("SessionCreated" in payload) {
          const sc = payload.SessionCreated as { id: string };
          if (sc?.id) setSessionId(sc.id);
        }
        if ("SessionsList" in payload) {
          const sl = payload.SessionsList as {
            sessions?: SessionRow[];
          };
          const newSessions = sl.sessions ?? [];
          setSessions(newSessions);
          setSessionId((cur) => {
            if (cur && newSessions.some(s => s.id === cur)) {
              return cur;
            }
            return newSessions.length > 0 ? newSessions[0].id : null;
          });
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
        if ("AgentsList" in payload) {
          const a = payload.AgentsList as { agents?: string[], active?: string };
          setAgentsList(a.agents ?? []);
          setActiveAgent(a.active ?? "DefaultAgent");
        }
        if ("AgentProfileLoaded" in payload) {
          const v = payload.AgentProfileLoaded as {
            client_request_id?: number;
            identity_markdown?: string;
            memory_markdown?: string;
          };
          const rid = v.client_request_id ?? 0;
          if (rid === profileLoadReqIdRef.current) {
            setAgentProfileIdentity(v.identity_markdown ?? "");
            setAgentProfileMemory(v.memory_markdown ?? "");
            setAgentProfileLoading(false);
          }
        }
        if ("AgentProfileLoadFailed" in payload) {
          const v = payload.AgentProfileLoadFailed as {
            client_request_id?: number;
            message?: string;
          };
          const rid = v.client_request_id ?? 0;
          if (rid === profileLoadReqIdRef.current) {
            setAgentProfileLoading(false);
            toast.error("无法加载档案", {
              description: v.message ?? "未知错误",
            });
          }
        }
        if ("AgentProfileSaved" in payload) {
          const v = payload.AgentProfileSaved as { agent_id?: string };
          toast.success("档案已保存", {
            description: v.agent_id ?? "",
          });
        }
        if ("ToolApprovalRequested" in payload) {
          const tar = payload.ToolApprovalRequested as {
            approval_id: string;
            session_id: string;
            tool_name: string;
            arguments_json: string;
          };
          setPendingApproval(tar);
        }
        if ("ScheduleList" in payload) {
          const j = payload.ScheduleList as { jobs?: ScheduleJobRow[] };
          setScheduleJobs(j.jobs ?? []);
        }
        if ("ScheduleJobAdded" in payload || "ScheduleJobRemoved" in payload) {
          void send("ScheduleList");
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
      // 订阅就绪后再拉一次快照，确保至少收到一条事件（补偿丢失的 Ready）
      void invoke("kernel_send", { cmd: "GetConfigSnapshot" }).catch(() => {});
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

  const saveAgentProfile = () => {
    if (!activeAgent.trim()) return;
    void send({
      SaveAgentProfile: {
        agent_id: activeAgent,
        identity_markdown: agentProfileIdentity,
        memory_markdown: agentProfileMemory,
      },
    });
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
          <Sidebar
            send={send}
            sessions={sessions}
            sessionId={sessionId}
            selectSession={selectSession}
            loadSessionHistory={loadSessionHistory}
            sessionRenameDraft={sessionRenameDraft}
            setSessionRenameDraft={setSessionRenameDraft}
            applySessionRename={applySessionRename}
            setDeleteConfirmId={setDeleteConfirmId}
            agentsList={agentsList}
            activeAgent={activeAgent}
            onSelectAgent={(agent_id) => send({ SetActiveAgent: { agent_id } })}
            onOpenAgentProfileEditor={() => setAgentProfileOpen(true)}
          />

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
                  <ChatPanel
                    sessionId={sessionId}
                    linesForSession={linesForSession}
                    chatBottomRef={chatBottomRef as React.RefObject<HTMLDivElement>}
                  />
                </TabsContent>
                <TabsContent
                  value="log"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-0 pt-3 outline-none data-[state=inactive]:hidden"
                >
                  <EventLogPanel
                    log={log}
                    bottomRef={bottomRef as React.RefObject<HTMLDivElement>}
                  />
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
      <InspectorDrawer
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        inspectorTab={inspectorTab}
        setInspectorTab={(val) => {
          setInspectorTab(val);
          saveUiPrefs({ inspectorTab: val });
        }}
        memoryQuery={memoryQuery}
        setMemoryQuery={setMemoryQuery}
        memoryBudget={memoryBudget}
        setMemoryBudget={setMemoryBudget}
        sessionId={sessionId}
        recallMemory={recallMemory}
        memoryPreview={memoryPreview}
        memoryForgetId={memoryForgetId}
        setMemoryForgetId={setMemoryForgetId}
        forgetMemory={forgetMemory}
        schedCron={schedCron}
        setSchedCron={setSchedCron}
        schedTz={schedTz}
        setSchedTz={setSchedTz}
        schedPrompt={schedPrompt}
        setSchedPrompt={setSchedPrompt}
        addSchedule={addSchedule}
        schedRemoveId={schedRemoveId}
        setSchedRemoveId={setSchedRemoveId}
        removeSchedule={removeSchedule}
        scheduleJobs={scheduleJobs}
        mcpServers={mcpServers}
        delTarget={delTarget}
        setDelTarget={setDelTarget}
        delInstr={delInstr}
        setDelInstr={setDelInstr}
        runDelegate={runDelegate}
        swarmText={swarmText}
        setSwarmText={setSwarmText}
        runSwarm={runSwarm}
        onRunHealthCheck={() => void send("RunHealthCheck")}
        healthReport={healthReport}
        policyTrail={policyTrail}
        auditTrail={auditTrail}
      />

      <AgentProfileSheet
        open={agentProfileOpen}
        onOpenChange={setAgentProfileOpen}
        activeAgent={activeAgent}
        identity={agentProfileIdentity}
        memory={agentProfileMemory}
        onIdentityChange={setAgentProfileIdentity}
        onMemoryChange={setAgentProfileMemory}
        loading={agentProfileLoading}
        onSave={saveAgentProfile}
      />

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        configSnapshot={configSnapshot}
        onRefreshConfig={() => void send("GetConfigSnapshot")}
        onRunHealthCheck={() => void send("RunHealthCheck")}
        onCopyConfigJson={() => void copyConfigJson()}
      />
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

      <AlertDialog
        open={pendingApproval != null}
        onOpenChange={(open) => {
          if (!open && pendingApproval) {
            void send({ RespondToolApproval: { approval_id: pendingApproval.approval_id, approved: false } });
            setPendingApproval(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-warning text-yellow-500">敏感动作执行确认 (Sandbox)</AlertDialogTitle>
            <AlertDialogDescription>
              当前 Agent 尝试执行系统级操作。请检查工具和参数：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-muted p-3 rounded-md overflow-hidden text-xs font-mono text-muted-foreground break-all max-h-48 overflow-y-auto">
            <span className="text-foreground block mb-1">[{pendingApproval?.tool_name}]</span>
            {pendingApproval?.arguments_json}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (pendingApproval) {
                  void send({ RespondToolApproval: { approval_id: pendingApproval.approval_id, approved: false } });
                  setPendingApproval(null);
                }
              }}
            >
              拦截并拒绝
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-yellow-600 text-white hover:bg-yellow-700"
              onClick={() => {
                if (pendingApproval) {
                  void send({ RespondToolApproval: { approval_id: pendingApproval.approval_id, approved: true } });
                  setPendingApproval(null);
                }
              }}
            >
              授权执行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster theme="dark" richColors position="top-center" />
    </div>
  );
}
