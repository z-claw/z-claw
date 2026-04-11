import type { TranscriptMsg } from "@/lib/transcript";
import i18n from "@/lib/i18n";

export function transcriptToMarkdown(
  sessionId: string,
  lines: TranscriptMsg[],
): string {
  const head = `# ${i18n.t("export.markdownHeading")}\n\n- ${i18n.t("export.sessionLine")}: \`${sessionId}\`\n- ${i18n.t("export.exportedLine")}: ${new Date().toISOString()}\n\n---\n\n`;
  const body = lines
    .map(
      (m) =>
        `## ${m.role}${m.streaming ? i18n.t("export.streamingSuffix") : ""}\n\n${m.text}\n`,
    )
    .join("\n");
  return head + body;
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
