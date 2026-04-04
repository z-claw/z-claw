import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  CalendarClock,
  Layers,
  MessageSquare,
  Network,
  Radio,
  Send,
  Sparkles,
  Users,
} from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type KernelTone,
  parseSwarmTasks,
  summarizeKernelEvent,
} from "@/lib/kernel-display";

import "./App.css";

type KernelEventPayload = Record<string, unknown>;

type LogEntry = {
  id: string;
  at: number;
  payload: KernelEventPayload;
  summary: ReturnType<typeof summarizeKernelEvent>;
};

type SessionRow = { id: string; title: string };

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
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async (cmd: unknown) => {
    try {
      await invoke("kernel_send", { cmd });
    } catch (err) {
      setLog((prev) => [
        ...prev,
        {
          id: newId(),
          at: Date.now(),
          payload: {},
          summary: {
            label: "invoke",
            detail: String(err),
            tone: "danger",
          },
        },
      ]);
    }
  }, []);

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

  const selectSession = (id: string) => {
    setSessionId(id);
  };

  const sendMessage = () => {
    const t = messageDraft.trim();
    if (!sessionId || !t) return;
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
            <Badge
              variant="outline"
              className="max-w-[min(100vw-2rem,280px)] truncate border-border/60 bg-muted/30 font-mono text-[10px] text-muted-foreground"
            >
              session: {sessionId ?? "—"}
            </Badge>
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
              内核事件摘要；完整 JSON 可在后续版本折叠查看。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 px-0 pb-4">
            <ScrollArea className="min-h-[200px] flex-1 px-6">
              <div className="space-y-2 pr-4 pb-2">
                {log.length === 0 ? (
                  <Empty className="min-h-[200px] border-border/30 bg-muted/10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Radio className="size-5 text-primary/70" />
                      </EmptyMedia>
                      <EmptyTitle>等待 kernel-event</EmptyTitle>
                      <EmptyDescription>
                        启动后会看到 Ready、会话与模型流式输出等条目。
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
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
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
              <div className="flex justify-end">
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
              记忆、调度、委派与 Swarm；依赖当前会话的指令会校验 session。
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 pt-4">
            <Tabs defaultValue="memory" className="flex h-full min-h-0 flex-col gap-3">
              <TabsList variant="line" className="w-full justify-start gap-0">
                <TabsTrigger value="memory" className="font-mono text-xs">
                  记忆
                </TabsTrigger>
                <TabsTrigger value="schedule" className="font-mono text-xs">
                  调度
                </TabsTrigger>
                <TabsTrigger value="agents" className="font-mono text-xs">
                  Agent
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
                      <FieldDescription>默认 8000</FieldDescription>
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
                </FieldGroup>
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
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
