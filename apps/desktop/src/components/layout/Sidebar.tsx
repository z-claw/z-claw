import { Activity, Layers, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { SessionRow } from "../../types";

export interface SidebarProps {
  send: (cmd: unknown) => void;
  sessions: SessionRow[];
  sessionId: string | null;
  selectSession: (id: string) => void;
  loadSessionHistory: (id: string) => void;
  sessionRenameDraft: string;
  setSessionRenameDraft: (v: string) => void;
  applySessionRename: () => void;
  setDeleteConfirmId: (id: string) => void;
  agentsList: string[];
  activeAgent: string;
  onSelectAgent: (agent_id: string) => void;
}

export function Sidebar({
  send,
  sessions,
  sessionId,
  selectSession,
  loadSessionHistory,
  sessionRenameDraft,
  setSessionRenameDraft,
  applySessionRename,
  setDeleteConfirmId,
  agentsList,
  activeAgent,
  onSelectAgent,
}: SidebarProps) {
  return (
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
        <div className="shrink-0 space-y-1.5 p-3 mx-[-12px] mt-[-12px] bg-primary/5 border-b border-border/30">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
            <span>当前智能体身份 (Workspace)</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Beta</span>
          </p>
          <div className="flex gap-1.5 mt-2">
            <select
              className="flex h-8 min-w-0 flex-1 rounded-md border border-input/50 bg-background/50 px-2.5 py-1 text-xs shadow-sm shadow-black/5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
              value={activeAgent}
              onChange={(e) => onSelectAgent(e.target.value)}
            >
              {agentsList.length > 0 ? (
                agentsList.map(a => <option key={a} value={a}>{a}</option>)
              ) : (
                <option value={activeAgent}>{activeAgent}</option>
              )}
            </select>
            <Button
              size="icon-sm"
              variant="outline"
              className="size-8 shrink-0 border-input/50 bg-background/50 text-muted-foreground"
              onClick={() => {
                const name = window.prompt("请输入新智能体档案名称 (英文字母结尾不要带空格):", "MyAgent");
                if (name && name.trim()) {
                  send({ CreateAgentProfile: { agent_id: name.trim() } });
                }
              }}
              title="新建智能体档案"
            >
              <Sparkles className="size-3.5" />
            </Button>
          </div>
        </div>
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
  );
}
