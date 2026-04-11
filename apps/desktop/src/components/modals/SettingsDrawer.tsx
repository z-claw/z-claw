import { ChevronDown, FileDown, Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { ConfigSnapshotStructured } from "@/lib/config-snapshot-view";
import { downloadJsonFile } from "@/lib/export-markdown";
import i18n from "@/lib/i18n";
import { saveUiPrefs, type AppLocale } from "@/lib/ui-prefs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";

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
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-border/50 bg-card/95 shadow-2xl sm:max-w-md"
      >
        <SheetHeader className="space-y-1 border-b border-border/35 bg-card/50 pb-4 text-left">
          <SheetTitle className="font-heading text-foreground">
            {t("settings.title")}
          </SheetTitle>
          <SheetDescription className="text-[11px] leading-relaxed text-muted-foreground/90">
            {t("settings.description")}
          </SheetDescription>
          {configSnapshot !== null &&
            typeof configSnapshot === "object" &&
            "config_file_path" in configSnapshot && (
              <p className="mt-2 break-all rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-snug text-foreground/85">
                {t("settings.configPathLabel")}{" "}
                {String(
                  (configSnapshot as { config_file_path?: unknown })
                    .config_file_path ?? "",
                )}
              </p>
            )}
        </SheetHeader>
        <div className="flex flex-col gap-3 border-b border-border/25 px-4 py-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">
              {t("settings.language")}
            </Label>
            <Select
              value={(i18n.language === "en" ? "en" : "zh") as AppLocale}
              onValueChange={(v) => {
                const loc = v as AppLocale;
                void i18n.changeLanguage(loc);
                saveUiPrefs({ locale: loc });
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-full max-w-xs font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">{t("settings.languageZh")}</SelectItem>
                <SelectItem value="en">{t("settings.languageEn")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 py-3 px-4">
          <Button
            size="sm"
            variant="secondary"
            className="font-mono text-xs"
            onClick={onRefreshConfig}
          >
            {t("settings.refreshSnapshot")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={onRunHealthCheck}
          >
            <Stethoscope className="mr-1 size-3.5" />
            {t("settings.runHealth")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            onClick={onCopyConfigJson}
            disabled={configSnapshot == null}
          >
            {t("settings.copyJson")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs"
            disabled={configSnapshot == null}
            onClick={() => {
              if (configSnapshot == null) return;
              downloadJsonFile(
                `z-claw-config-snapshot-${Date.now()}.json`,
                configSnapshot,
              );
              toast.success(t("toast.configSnapshotDownloaded"));
            }}
          >
            <FileDown className="mr-1 size-3.5" />
            {t("settings.exportJson")}
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          <div className="flex flex-col gap-3 pr-3">
            <ConfigSnapshotStructured snapshot={configSnapshot} />
            <Collapsible className="rounded-md border border-border/35 bg-muted/15">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left font-mono text-xs text-muted-foreground hover:text-foreground">
                <span>{t("settings.rawJson")}</span>
                <ChevronDown className="size-4 shrink-0 opacity-70" />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border/30 px-0 pb-3">
                <pre className="max-h-[min(40vh,320px)] overflow-auto whitespace-pre-wrap break-all px-3 pt-2 font-mono text-[10px] leading-relaxed text-foreground/85">
                  {configSnapshot == null
                    ? t("settings.waitingSnapshot")
                    : JSON.stringify(configSnapshot, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
