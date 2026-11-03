import { hasDiaryText } from "./diary-mappers";

export interface DiaryBodyDraft {
  readonly title: string;
  readonly content: string;
  readonly keywords: readonly string[];
  readonly importance: number | null;
  readonly tags: readonly string[];
}

const tagMap = new Map([
  ["共同经历", "shared_moment"], ["情感时刻", "emotion"], ["重要事件", "life_event"],
  ["喜好", "preference"], ["雷区", "preference"], ["喜好/雷区", "preference"],
  ["约定", "promise"], ["承诺", "promise"], ["约定承诺", "promise"],
  ["里程碑", "milestone"], ["关系里程碑", "milestone"],
]);
const splitWords = (value: string) => [...new Set(value.split(/[,，、]/).map(word => word.trim()).filter(Boolean))];

/** Only explicit body sections qualify. Chat prose, quoted examples and code fences are not a fallback. */
export function parseDiaryBody(text: string): DiaryBodyDraft | null {
  const fields = new Map<string, string>();
  const body: string[] = [];
  let field: string | null = null, fence: string | null = null, endedAtMetadata = false;
  const append = (value: string) => {
    if (field === "正文") body.push(value);
    else if (field) fields.set(field, (fields.get(field) ?? "") + value);
  };
  for (const raw of text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? []) {
    if (!raw) continue;
    const line = raw.replace(/[\r\n]+$/, ""), ending = raw.slice(line.length);
    const code = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (code && code[1][0] === fence[0] && code[1].length >= fence.length && !code[2].trim()) fence = null;
      append(raw); continue;
    }
    if (code && (code[1][0] !== "`" || !code[2].includes("`"))) { fence = code[1]; append(raw); continue; }
    // Four-space/tab indents, quotes and inline code cannot introduce sections.
    // Inside a body these lines still pass through unchanged.
    const candidates = /^ {0,3}(?:#{1,6}[ \t]+)?(?:\*\*)?【(?:标题|正文|关键词|重要性|标签)】/.test(line)
      ? [...line.matchAll(/(`+)|(\*\*)?【(标题|正文|关键词|重要性|标签)】/g)] : [];
    let inlineCode: number | null = null;
    const markers = candidates.filter((marker, index) => {
      if (!marker[1]) return inlineCode === null;
      if (inlineCode === marker[1].length) inlineCode = null;
      else if (inlineCode === null && candidates.slice(index + 1).some(next => next[1]?.length === marker[1].length)) inlineCode = marker[1].length;
      return false;
    });
    if (!markers.length) {
      append(raw);
      continue;
    }
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      if (field === "正文" && marker[3] !== "正文") endedAtMetadata = true;
      field = marker[3];
      let start = marker.index! + marker[0].length;
      if (marker[2] && line.startsWith(marker[2], start)) start += marker[2].length;
      // A single separator space is formatting; additional indentation belongs to the body.
      if (line[start] === " " && line[start + 1] !== " " && line[start + 1] !== "\t") start++;
      if (field === "正文") {
        endedAtMetadata = false;
        const value = line.slice(start);
        if (value.trim()) append(value + ending);
        break; // Inline field-looking text is part of this body's original Markdown.
      }
      fields.set(field, line.slice(start, markers[i + 1]?.index) + (i === markers.length - 1 ? ending : ""));
    }
  }
  const content = endedAtMetadata ? body.join("").replace(/(?:\r\n|\r|\n)$/, "") : body.join("");
  if (!hasDiaryText(content)) return null;
  const importanceText = fields.get("重要性")?.trim() ?? "";
  const importance = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(importanceText) ? Number(importanceText) : NaN;
  const tagText = fields.get("标签") ?? "";
  const tags = [...new Set([...tagMap].filter(([label]) => tagText.includes(label)).map(([, code]) => code))];
  for (const word of splitWords(tagText)) if ([...tagMap.values()].includes(word) && !tags.includes(word)) tags.push(word);
  return {
    title: fields.get("标题")?.trim() ?? "", content,
    keywords: splitWords(fields.get("关键词") ?? ""), tags,
    importance: Number.isFinite(importance) ? Math.max(0, Math.min(1, importance)) : null,
  };
}
