/** Visibility check only: never rewrite the message or the text inside a bubble. */
function hasVisibleText(content: string): boolean {
  return content.replace(/[\p{Cc}\p{Default_Ignorable_Code_Point}]/gu, "").trim().length > 0;
}

export function splitUserBubbles(content: string): string[] {
  return content.split(/\r\n?|\n/).filter(hasVisibleText);
}

export function splitAssistantBubbles(content: string): string[] {
  // Keep the existing ``` fence exception. Markdown-aware segmentation is a separate task.
  const parts: string[] = [];
  let current = "";
  let fenceOpen = false;

  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^```/.test(line)) fenceOpen = !fenceOpen;
    if (!hasVisibleText(line) && !fenceOpen) {
      if (current) parts.push(current);
      current = "";
      continue;
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) parts.push(current);

  // MarkdownRenderer hides these standalone breaks. Empty output must stay [],
  // including while the upstream display filter holds a partial SSE control marker.
  return parts.filter(chunk => hasVisibleText(chunk) && !["---", "***", "___"].includes(chunk.trim()));
}
