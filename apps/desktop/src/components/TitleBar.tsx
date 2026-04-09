import { useCallback, useEffect, useMemo, useState } from "react";
import { Window, type WindowOptions } from "@tauri-apps/api/window";
import {
  Copy,
  Maximize2,
  Minus,
  PanelRight,
  Settings2,
  Sparkles,
  SquareStack,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

function isTauriWebview(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getMainWindow(): Window {
  return new Window("main", { skip: true } as WindowOptions & { skip: boolean });
}

export type TitleBarProps = {
  kernelReady: boolean;
  sessionId: string | null;
  onCopySessionId: () => void;
  onOpenSettings: () => void;
  onOpenInspector: () => void;
};

export function TitleBar({
  kernelReady,
  sessionId,
  onCopySessionId,
  onOpenSettings,
  onOpenInspector,
}: TitleBarProps) {
  const tauri = isTauriWebview();
  const appWindow = useMemo(() => (tauri ? getMainWindow() : null), [tauri]);
  const [maximized, setMaximized] = useState(false);

  const syncMaximized = useCallback(async () => {
    if (!tauri || !appWindow) return;
    try {
      setMaximized(await appWindow.isMaximized());
    } catch {
      /* ignore */
    }
  }, [tauri, appWindow]);

  useEffect(() => {
    if (!tauri || !appWindow) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      await syncMaximized();
      if (cancelled) return;
      unlisten = await appWindow.onResized(() => {
        void syncMaximized();
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [tauri, appWindow, syncMaximized]);

  const runWindowOp = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        const msg = String(e);
        console.error(`[TitleBar] ${label}`, e);
        toast.error(label, { description: msg });
      }
    },
    [],
  );

  const dragProps = tauri
    ? ({
        "data-tauri-drag-region": true,
        onDoubleClick: () =>
          void runWindowOp("无法切换最大化", () => appWindow!.toggleMaximize()),
      } as const)
    : {};

  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-stretch border-b border-border/45",
        "bg-card/75 backdrop-blur-xl supports-[backdrop-filter]:bg-card/55",
      )}
    >
      {/* 品牌 + 拖拽 */}
      <div
        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 sm:gap-3 sm:px-4"
        {...dragProps}
      >
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/14 text-primary shadow-[inset_0_1px_0_oklch(1_0_0/12%)]"
          aria-hidden
        >
          <Sparkles className="size-3.5 opacity-95" />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold tracking-[0.14em] text-primary sm:text-xs">
            Z-CLAW
          </div>
          {tauri ? (
            <p className="mt-0.5 hidden truncate text-[10px] leading-tight text-muted-foreground/85 md:block">
              拖动标题栏移动窗口 · 双击最大化
            </p>
          ) : (
            <p className="mt-0.5 hidden truncate text-[10px] text-muted-foreground/85 sm:block">
              本地 Agent 控制台
            </p>
          )}
        </div>
      </div>

      <div
        className="hidden h-8 w-px shrink-0 self-center bg-border/55 sm:block"
        aria-hidden
      />

      {/* 状态与操作 */}
      <div
        className="flex min-w-0 items-center gap-2 px-2 py-1.5 sm:gap-2.5 sm:px-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium",
            kernelReady
              ? "bg-emerald-950/40 text-emerald-100/95"
              : "bg-muted/60 text-muted-foreground",
          )}
          title={kernelReady ? "内核已连接" : "正在连接内核"}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              kernelReady ? "bg-emerald-400" : "animate-pulse bg-muted-foreground/70",
            )}
          />
          <span className="hidden sm:inline">
            {kernelReady ? "已连接" : "连接中"}
          </span>
        </div>

        <div
          className="flex min-w-0 max-w-[9.5rem] items-center rounded-md border border-border/45 bg-background/45 px-1.5 py-0.5 sm:max-w-[14rem]"
          title={sessionId ?? "未选会话"}
        >
          <span className="min-w-0 flex-1 truncate px-0.5 font-mono text-[10px] text-foreground/85 sm:text-[11px]">
            {sessionId ?? "未选择会话"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={!sessionId}
            onClick={() => onCopySessionId()}
            title="复制会话 ID"
          >
            <Copy className="size-3.5" />
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/40 bg-muted/25 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 text-muted-foreground hover:bg-background/60 hover:text-foreground"
            onClick={() => onOpenInspector()}
            title="检查器"
          >
            <PanelRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 text-muted-foreground hover:bg-background/60 hover:text-foreground"
            onClick={() => onOpenSettings()}
            title="设置"
          >
            <Settings2 className="size-4" />
          </Button>
        </div>

        {tauri && appWindow ? (
          <div className="ml-0.5 flex h-full shrink-0 items-stretch border-l border-border/45 pl-1 sm:ml-1 sm:pl-2">
            <button
              type="button"
              className="flex w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground sm:w-10"
              onClick={() =>
                void runWindowOp("无法最小化", () => appWindow.minimize())
              }
              aria-label="最小化"
            >
              <Minus className="size-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              className="flex w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground sm:w-10"
              onClick={() =>
                void runWindowOp("无法最大化", () => appWindow.toggleMaximize())
              }
              aria-label={maximized ? "还原" : "最大化"}
            >
              {maximized ? (
                <SquareStack className="size-3.5" strokeWidth={2} />
              ) : (
                <Maximize2 className="size-3.5" strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              className={cn(
                "titlebar-close flex w-9 items-center justify-center text-muted-foreground transition-colors sm:w-10",
                "hover:bg-destructive/80 hover:text-destructive-foreground",
              )}
              onClick={() =>
                void runWindowOp("无法关闭", () => appWindow.close())
              }
              aria-label="关闭"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
