import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/35 pb-3 text-left">
          <SheetTitle className="text-base">{t("agentProfile.title")}</SheetTitle>
          <SheetDescription className="text-xs">
            {t("agentProfile.description", { agent: activeAgent })}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Spinner className="size-6" />
              <p className="text-xs">{t("agentProfile.loading")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="agent-identity" className="text-xs">
                  {t("agentProfile.identityLabel")}
                </Label>
                <Textarea
                  id="agent-identity"
                  value={identity}
                  onChange={(e) => onIdentityChange(e.target.value)}
                  placeholder={t("agentProfile.identityPlaceholder")}
                  className="min-h-[140px] resize-y font-mono text-xs leading-relaxed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-memory" className="text-xs">
                  {t("agentProfile.memoryLabel")}
                </Label>
                <Textarea
                  id="agent-memory"
                  value={memory}
                  onChange={(e) => onMemoryChange(e.target.value)}
                  placeholder={t("agentProfile.memoryPlaceholder")}
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
            {t("agentProfile.close")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || !activeAgent}
            onClick={() => onSave()}
          >
            {t("agentProfile.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
