import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { Spinner } from "@workspace/ui/components/spinner";

export interface AgentProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeAgent: string;
  identity: string;
  memory: string;
  onIdentityChange: (v: string) => void;
  onMemoryChange: (v: string) => void;
  loading: boolean;
  onSave: () => void;
}

export function AgentProfileSheet({
  open,
  onOpenChange,
  activeAgent,
  identity,
  memory,
  onIdentityChange,
  onMemoryChange,
  loading,
  onSave,
}: AgentProfileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/35 pb-3 text-left">
          <SheetTitle className="text-base">编辑智能体档案</SheetTitle>
          <SheetDescription className="text-xs">
            对应工作区目录{" "}
            <span className="font-mono text-foreground/90">{activeAgent}</span>
            下的 <span className="font-mono">IDENTITY.md</span> 与{" "}
            <span className="font-mono">MEMORY.md</span>。保存后立即生效于后续对话与委派。
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Spinner className="size-6" />
              <p className="text-xs">正在从磁盘加载档案…</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="agent-identity" className="text-xs">
                  Identity（IDENTITY.md）
                </Label>
                <Textarea
                  id="agent-identity"
                  value={identity}
                  onChange={(e) => onIdentityChange(e.target.value)}
                  placeholder="系统提示 / 人格描述"
                  className="min-h-[140px] resize-y font-mono text-xs leading-relaxed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-memory" className="text-xs">
                  Memory（MEMORY.md）
                </Label>
                <Textarea
                  id="agent-memory"
                  value={memory}
                  onChange={(e) => onMemoryChange(e.target.value)}
                  placeholder="长期记忆要点（Markdown 列表等）"
                  className="min-h-[120px] resize-y font-mono text-xs leading-relaxed"
                />
              </div>
            </>
          )}
        </div>
        <SheetFooter className="border-t border-border/35 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || !activeAgent}
            onClick={() => onSave()}
          >
            保存到磁盘
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
