import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  FilePenLine,
  Layers,
  RotateCw,
  Sparkles,
  Trash2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
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
  onOpenAgentProfileEditor: () => void;
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
  onOpenAgentProfileEditor,
}: SidebarProps) {
  const { t } = useTranslation();
  const agentSelectOptions = useMemo(() => {
    const ids = new Set(agentsList);
    if (activeAgent.length > 0) ids.add(activeAgent);
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [agentsList, activeAgent]);

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
          {t("sidebar.title")}
        </CardTitle>
        <CardDescription className="text-[11px] leading-relaxed text-muted-foreground/90">
          {t("sidebar.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-3">
        <div className="shrink-0 space-y-1.5 p-3 mx-[-12px] mt-[-12px] bg-primary/5 border-b border-border/30">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
            <span>{t("sidebar.workspaceLabel")}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              {t("sidebar.beta")}
            </span>
          </p>
          <div className="flex gap-1.5 mt-2">
            <Select
              value={activeAgent}
              onValueChange={(v) => {
                if (v != null && v !== "") onSelectAgent(v);
              }}
              onOpenChange={(open) => {
                if (open) send("ListAgents");
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-8 min-w-0 flex-1 border-input/50 bg-background/50 px-2.5 text-xs shadow-sm shadow-black/5 ring-offset-background focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring"
              >
                <SelectValue placeholder={t("sidebar.selectAgentPlaceholder")} />
              </SelectTrigger>
              <SelectContent
                side="bottom"
                align="start"
                className="max-h-72 min-w-(--anchor-width)"
              >
                {agentSelectOptions.map((a) => (
                  <SelectItem key={a} value={a} className="font-mono text-xs">
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon-sm"
              variant="outline"
              className="size-8 shrink-0 border-input/50 bg-background/50 text-muted-foreground"
              onClick={() => {
                const name = window.prompt(
                  t("sidebar.promptNewAgent"),
                  "MyAgent",
                );
                if (name && name.trim()) {
                  send({ CreateAgentProfile: { agent_id: name.trim() } });
                }
              }}
              title={t("sidebar.newAgentProfileTitle")}
            >
              <Sparkles className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              className="size-8 shrink-0 border-input/50 bg-background/50 text-muted-foreground"
              onClick={() => onOpenAgentProfileEditor()}
              title={t("sidebar.editAgentProfileTitle")}
            >
              <FilePenLine className="size-3.5" />
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
            {t("sidebar.newSession")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-center gap-2 text-xs sm:justify-start"
            onClick={() => send("ListSessions")}
          >
            <Activity className="size-3.5 opacity-80" />
            {t("sidebar.refreshList")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="justify-center gap-2 text-xs sm:justify-start"
            disabled={!sessionId}
            onClick={() => sessionId && loadSessionHistory(sessionId)}
          >
            <RotateCw className="size-3.5 opacity-80" />
            {t("sidebar.syncHistory")}
          </Button>
        </div>
        <Separator className="bg-border/30" />
        <div className="shrink-0 space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            {t("sidebar.renameSection")}
          </p>
          <div className="flex gap-1.5">
            <Input
              value={sessionRenameDraft}
              onChange={(e) => setSessionRenameDraft(e.target.value)}
              disabled={!sessionId}
              placeholder={
                sessionId ? t("sidebar.titlePlaceholder") : t("sidebar.selectSessionFirst")
              }
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
              {t("sidebar.save")}
            </Button>
          </div>
        </div>
        <Separator className="shrink-0 bg-border/30" />
        <div className="flex min-h-0 flex-1 flex-col space-y-1">
          <p className="mb-1.5 shrink-0 text-[11px] font-medium text-muted-foreground">
            {t("sidebar.sessionList")}
          </p>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1.5 pr-3">
              {sessions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/35 bg-muted/15 px-3 py-6 text-center text-[11px] text-muted-foreground">
                  {t("sidebar.emptyHint")}
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
                      title={t("sidebar.deleteSessionTitle")}
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
