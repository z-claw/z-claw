import { MessageSquare, Wrench, CheckCircle2, XCircle, Loader2, Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { cn } from "@workspace/ui/lib/utils";
import type { TranscriptMsg } from "../../lib/transcript";

export interface ChatPanelProps {
  sessionId: string | null;
  linesForSession: TranscriptMsg[];
  chatBottomRef: React.RefObject<HTMLDivElement>;
}

/** Inline tool-call status row shown between assistant turns. */
function ToolCallRow({ msg }: { msg: TranscriptMsg }) {
  const { t } = useTranslation();
  return (
    <div className="mx-3 my-0.5 flex items-center gap-2 rounded-md border border-border/25 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
      <Wrench className="size-3 shrink-0 text-primary/60" />
      <span className="font-mono">{msg.text}</span>
      {msg.toolRunning ? (
        <Loader2 className="ml-auto size-3 animate-spin text-primary/60" />
      ) : msg.toolOk ? (
        <CheckCircle2 className="ml-auto size-3 text-emerald-500/80" title={t("chat.toolCallFinished_ok")} />
      ) : (
        <XCircle className="ml-auto size-3 text-destructive/80" title={t("chat.toolCallFinished_err")} />
      )}
    </div>
  );
}

export function ChatPanel({
  sessionId,
  linesForSession,
  chatBottomRef,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  /** Filter messages by search query (#7). Only searches user/assistant text. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return linesForSession;
    return linesForSession.filter(
      (m) =>
        m.role !== "tool_call" &&
        m.text.toLowerCase().includes(q),
    );
  }, [linesForSession, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search bar (#7) */}
      {sessionId && (
        <div className="relative mx-4 mb-2 mt-1 sm:mx-5">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chat.searchPlaceholder")}
            className="w-full rounded-md border border-border/40 bg-muted/20 py-1.5 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1 px-4 sm:px-5">
        <div className="space-y-3 pr-4 pb-2">
          {!sessionId ? (
            <Empty className="min-h-[200px] border-border/30 bg-muted/12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquare className="size-5 text-primary/70" />
                </EmptyMedia>
                <EmptyTitle>{t("chat.emptyTitle")}</EmptyTitle>
                <EmptyDescription>{t("chat.emptyDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/30 bg-muted/10 py-10 text-center text-xs text-muted-foreground">
              {query ? t("chat.searchNoResults") : t("chat.noMessages")}
            </p>
          ) : (
            visible.map((m) => {
              if (m.role === "tool_call") {
                return <ToolCallRow key={m.id} msg={m} />;
              }
              return (
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
                      {m.role === "user" ? t("chat.you") : t("chat.assistant")}
                    </span>
                    {m.streaming ? (
                      <span className="font-mono text-[9px] text-primary/80">
                        {t("chat.streaming")}
                      </span>
                    ) : null}
                  </div>
                  {m.role === "assistant" ? (
                    /* Markdown rendering for assistant messages (#17) */
                    <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed text-foreground/92 [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border/30 [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Strip images to prevent automatic external resource loads
                          // (tracking pixels, privacy leaks) in the desktop webview.
                          img: () => null,
                          // Render links safely: block non-http(s) schemes; open
                          // externally so the webview never navigates away.
                          a: ({ href, children }) => {
                            const safe =
                              typeof href === "string" &&
                              (href.startsWith("https://") ||
                                href.startsWith("http://"));
                            if (!safe) return <>{children}</>;
                            return (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open(
                                    href,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }}
                              >
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {m.text || " "}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/92">
                      {m.text || " "}
                    </p>
                  )}
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

