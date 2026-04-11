import { useTranslation } from "react-i18next";
import { ChevronDown, Radio } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { cn } from "@workspace/ui/lib/utils";
import type { LogEntry } from "../../types";

export interface EventLogPanelProps {
  log: LogEntry[];
  bottomRef: React.RefObject<HTMLDivElement>;
}

function toneBadgeClass(tone: string): string {
  const m: Record<string, string> = {
    neutral: "border-border/60 bg-muted/40 text-muted-foreground",
    success: "border-emerald-500/40 bg-emerald-950/40 text-emerald-100",
    accent: "border-primary/45 bg-primary/12 text-primary",
    warning: "border-orange-400/40 bg-orange-950/35 text-orange-100",
    danger: "border-destructive/50 bg-destructive/15 text-red-100",
  };
  return m[tone] || m["neutral"];
}

export function EventLogPanel({ log, bottomRef }: EventLogPanelProps) {
  const { t } = useTranslation();
  return (
    <ScrollArea className="min-h-0 flex-1 px-4 sm:px-5">
      <div className="space-y-2 pr-4 pb-2">
        {log.length === 0 ? (
          <Empty className="min-h-[180px] border-border/30 bg-muted/10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Radio className="size-5 text-primary/70" />
              </EmptyMedia>
              <EmptyTitle>{t("eventLog.empty")}</EmptyTitle>
              <EmptyDescription>{t("eventLog.emptyDescription")}</EmptyDescription>
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
                  {t("eventLog.rawJson")}
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
  );
}
