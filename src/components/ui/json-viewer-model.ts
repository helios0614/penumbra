export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const JSON_AUTO_TREE_CHARS = 128 * 1024;
export const JSON_MAX_TREE_CHARS = 2 * 1024 * 1024;
const MAX_DEPTH = 32, MAX_CHILDREN = 1000, MAX_VALUES = 20_000;
export const JSON_TREE_LIMIT_MESSAGE = "此内容的大小、层级或节点数量超出结构阅读范围，请使用完整原文或复制。";

// Only reject obvious prose. This is never used to extract a JSON substring.
export const mightBeJson = (source: string) => /^\s*(?:[\[{"\d-]|true\s*$|false\s*$|null\s*$)/.test(source);

/** A bounded safety check, not a renderer. The dependency owns all tree navigation. */
export function canRenderJsonTree(value: JsonValue): boolean {
  const pending: { value: JsonValue; depth: number }[] = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++count > MAX_VALUES || current.depth > MAX_DEPTH) return false;
    if (current.value !== null && typeof current.value === "object") {
      const values = Array.isArray(current.value) ? current.value : Object.values(current.value);
      if (values.length > MAX_CHILDREN) return false;
      for (const child of values) pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return true;
}

/** Preserve caller-supplied safe bytes, including whitespace and JSON primitives. */
export function jsonSource(data: JsonValue | undefined, rawText: string | undefined): string {
  if (rawText !== undefined) return rawText;
  try { return JSON.stringify(data, null, 2) ?? ""; } catch { return "（内容无法序列化）"; }
}

export type JsonReading = { kind: "json"; value: JsonValue; summary: string } | { kind: "text" | "limited" };
export function readJson(source: string, data?: JsonValue): JsonReading {
  if (data === undefined && !mightBeJson(source)) return { kind: "text" };
  if (source.length > JSON_MAX_TREE_CHARS) return { kind: "limited" };
  try {
    const value: JsonValue = data === undefined ? JSON.parse(source) : data;
    if (!canRenderJsonTree(value)) return { kind: "limited" };
    return { kind: "json", value, summary: Array.isArray(value) ? `${value.length} 项`
      : value !== null && typeof value === "object" ? `${Object.keys(value).length} 个字段`
        : value === null ? "null" : typeof value === "string" ? "字符串" : typeof value === "number" ? "数字" : "布尔值" };
  } catch { return { kind: "text" }; }
}

export function initiallyExpandJson(level: number, value: unknown) {
  return level === 0 && (value === null || typeof value !== "object" || Object.keys(value).length <= 200);
}
