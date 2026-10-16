import { isRecord, normalizeOutput } from "@/domain/quick-note";

export type QuickNoteFragment = { readonly kind: "text"; readonly text: string }
  | { readonly kind: "HEART" | "DRIFT"; readonly text: string; readonly raw: string };

// Walk complete outer bracket groups once. Nested/escaped/unfinished groups are
// kept together as plain text, including any marker-looking text inside them.
export function quickNoteFragments(output: string): readonly QuickNoteFragment[] {
  const text = normalizeOutput(output);
  const parts: QuickNoteFragment[] = [];
  let plainStart = 0;
  for (let cursor = 0; cursor < text.length; cursor++) {
    if (text[cursor] !== "[") continue;
    let depth = 1, end = cursor + 1, nested = false;
    for (; end < text.length && depth; end++) {
      if (text[end] === "[") { depth++; nested = true; }
      else if (text[end] === "]") depth--;
    }
    if (depth) break;
    const raw = text.slice(cursor, end);
    const kind = raw.startsWith("[HEART:") ? "HEART" : raw.startsWith("[DRIFT:") ? "DRIFT" : null;
    const content = kind ? raw.slice(kind.length + 2, -1) : "";
    if (kind && !nested && !raw.includes("\\") && text[cursor - 1] !== "\\" && text[end] !== "]" && content.trim()) {
      if (plainStart < cursor) parts.push({ kind: "text", text: text.slice(plainStart, cursor) });
      parts.push({ kind, text: content, raw });
      plainStart = end;
    }
    cursor = end - 1;
  }
  if (plainStart < text.length || !parts.length) parts.push({ kind: "text", text: text.slice(plainStart) });
  return parts;
}

export function quickNoteSpeakerTone(label: string): "ai" | "user" {
  return /^我[：:]?$/.test(label.trim()) ? "ai" : "user";
}

export function quickNoteLinePrefix(line: string) {
  const match = /^([ \t\u3000]*(?:[-*][ \t]+)?)([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z _-]{0,23})([ \t]*[：:])(.*)$/u.exec(line);
  if (!match) return null;
  const [, leading, label, colon, body] = match;
  const name = label.trim();
  // Short line-leading labels and standalone headings only; no sentence/URL,
  // timestamp, arbitrary inline colon, or person-name inference.
  if (/^[ \t]*[/\\]/.test(body)) return null;
  const heading = !body.trim() && name.length <= 16;
  const shortLabel = /^[\p{Script=Han}]{1,4}$/u.test(name) || /^[A-Za-z]+(?:[ _-][A-Za-z]+)*$/.test(name);
  if (!heading && !shortLabel) return null;
  return { leading, prefix: label + colon, body, tone: quickNoteSpeakerTone(name) };
}

export type QuickNoteSummaryKind = "events" | "dialogue" | "fallback";
export interface QuickNoteSummaryPanel {
  readonly title: string;
  readonly kind: QuickNoteSummaryKind;
  readonly value: unknown;
}

export function quickNoteSummaryPanels(raw: string): readonly QuickNoteSummaryPanel[] {
  if (!raw.trim()) return [];
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return [{ title: "原始摘要（非 JSON）", kind: "fallback", value: normalizeOutput(raw) }]; }
  if (!isRecord(value)) return [{ title: "辅助摘要", kind: "fallback", value }];
  return Object.entries(value).flatMap(([title, content]): QuickNoteSummaryPanel[] => {
    const kind = title === "事件归纳" ? "events" : title === "关键对话" ? "dialogue" : "fallback";
    const empty = content === null || typeof content === "string" && !content.trim()
      || Array.isArray(content) && !content.length || isRecord(content) && !Object.keys(content).length;
    return kind !== "fallback" && empty ? [] : [{ title, kind, value: content }];
  });
}

// Only explicit field names affect layout. Unknown fields stay visible in place.
export function quickNoteDialogueField(key: string): "time" | "original" | "note" | "speaker" | "unknown" {
  if (["time", "time_range", "时间", "时间范围", "时间段"].includes(key)) return "time";
  if (["content", "text", "dialogue", "对话", "原文", "原文对话", "对话原文"].includes(key)) return "original";
  if (["reason", "summary", "说明", "补充说明", "归纳", "归纳说明"].includes(key)) return "note";
  if (["speaker", "说话者"].includes(key)) return "speaker";
  return "unknown";
}

export function quickNoteJsonText(value: unknown, original: string): string {
  try { return JSON.stringify(value, null, 2) ?? String(value); }
  catch { return original; }
}
