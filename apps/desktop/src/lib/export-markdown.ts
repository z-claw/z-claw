import type { TranscriptMsg } from "@/lib/transcript";

export function transcriptToMarkdown(
  sessionId: string,
  lines: TranscriptMsg[],
): string {
  const head = `# z-claw 会话\n\n- session: \`${sessionId}\`\n- exported: ${new Date().toISOString()}\n\n---\n\n`;
  const body = lines
    .map((m) => `## ${m.role}${m.streaming ? " (streaming)" : ""}\n\n${m.text}\n`)
    .join("\n");
  return head + body;
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
