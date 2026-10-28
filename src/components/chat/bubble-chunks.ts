import { hasMarkdownOutput, hasVisibleText, isDefinitionOnly, parseBubbleMarkdown, protectedMarkdownLines } from "./markdown-boundaries";

export function splitUserBubbles(content: string): string[] {
  return content.split(/\r\n?|\n/).filter(hasVisibleText);
}

export function splitAssistantBubbles(content: string): string[] {
  const normalized = content.replace(/\r\n?/g, "\n");
  if (!hasVisibleText(normalized)) return [];
  const tree = parseBubbleMarkdown(normalized);
  const ranges = protectedMarkdownLines(tree);
  const parts: string[] = [];
  let current: string[] = [];
  let rangeIndex = 0;

  for (const [index, line] of normalized.split("\n").entries()) {
    const lineNumber = index + 1;
    while (ranges[rangeIndex] && ranges[rangeIndex][1] < lineNumber) rangeIndex++;
    const range = ranges[rangeIndex];
    const protectedLine = range && range[0] <= lineNumber && lineNumber <= range[1];
    if (!hasVisibleText(line) && !protectedLine) {
      if (current.length) parts.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) parts.push(current.join("\n"));

  // Each bubble is still parsed independently (reference sharing is MD-03).
  // Inspect its own syntax, not full-message definitions or raw punctuation.
  const visible = parts.filter(chunk => hasVisibleText(chunk) && hasMarkdownOutput(
    chunk === normalized ? tree : parseBubbleMarkdown(chunk),
  ));
  // Message-wide fallback only. Definitions accompanying normal body stay hidden;
  // this does not share definitions across independently parsed bubbles (MD-03).
  return visible.length === 0 && isDefinitionOnly(tree) ? [normalized] : visible;
}
