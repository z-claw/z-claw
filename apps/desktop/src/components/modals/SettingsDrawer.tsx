import { Stethoscope } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";

export interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configSnapshot: unknown | null;
  onRefreshConfig: () => void;
  onRunHealthCheck: () => void;
  onCopyConfigJson: () => void;
}

export function SettingsDrawer({
  open,
  onOpenChange,
  configSnapshot,
  onRefreshConfig,
  onRunHealthCheck,
  onCopyConfigJson,
}: SettingsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-border/50 bg-card/95 shadow-2xl sm:max-w-md"
      >
        <SheetHeader className="space-y-1 border-b border-border/35 bg-card/50 pb-4 text-left">
          <SheetTitle className="font-heading text-foreground">设置</SheetTitle>
          <SheetDescription className="text-[11px] leading-relaxed text-muted-foreground/90">
            只读快照（无 API 密钥明文）。请编辑下方「实际读取路径」对应的{" "}
            <code className="font-mono text-[10px]">config.json</code>
            ；打开本面板或点击「刷新快照」会从磁盘重载；发消息前也会尝试重载。
          </SheetDescription>
          {configSnapshot !== null &&
            typeof configSnapshot === "object" &&
            "config_file_path" in configSnapshot && (
              <p className="mt-2 break-all rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-snug text-foreground/85">
                实际读取路径：{" "}
                {String(
                  (configSnapshot as { config_file_path?: unknown })
                    .config_file_path ?? "",
                )}
              </p>
            )}
        </SheetHeader>
        <div className="flex flex-wrap gap-2 py-3 px-4">
          <Button
            size="sm"
            variant="secondary"
            className="font-mono text-xs"
            onClick={onRefreshConfig}
          >
            刷新快照
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={onRunHealthCheck}
          >
            <Stethoscope className="mr-1 size-3.5" />
            运行自检
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={onCopyConfigJson}
            disabled={configSnapshot == null}
          >
            复制 JSON
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          <pre className="whitespace-pre-wrap break-all rounded-md border border-border/35 bg-muted/25 p-3 font-mono text-[10px] leading-relaxed text-foreground/90">
            {configSnapshot == null
              ? "打开本面板时会自动请求快照…"
              : JSON.stringify(configSnapshot, null, 2)}
          </pre>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
