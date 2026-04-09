import { MessageSquare } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { cn } from "@workspace/ui/lib/utils";

export interface ChatPanelProps {
  sessionId: string | null;
  linesForSession: { id: string; role: string; text?: string; streaming?: boolean }[];
  chatBottomRef: React.RefObject<HTMLDivElement>;
}

export function ChatPanel({
  sessionId,
  linesForSession,
  chatBottomRef,
}: ChatPanelProps) {
  return (
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
  );
}
