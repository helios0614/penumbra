import type { JsonValue } from "@/domain/message";
import { JSON_AUTO_TREE_CHARS } from "@/components/ui/json-viewer-model";

type JsonObject = { readonly [key: string]: JsonValue };
export type DetailField = { key: string; label: string; text: string };
export type Body = { kind: "text"; text: string } | { kind: "hidden" | "missing" | "empty" };
export type MemoryItem = { index: number; type?: string; body: Body; scores: readonly DetailField[] };
export const objectValue = (value: JsonValue | undefined): JsonObject | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
const text = (value: JsonValue | undefined) => typeof value === "string" && value.trim() ? value : undefined;
export function displayBody(value: JsonValue | undefined): Body {
  if (typeof value !== "string") return { kind: "missing" };
  if (!value.trim()) return { kind: "empty" };
  if (/^(?:\[(?:私有内容已隐藏|已隐藏|redacted)\]|<redacted>|已隐藏)$/i.test(value.trim())) return { kind: "hidden" };
  return { kind: "text", text: value };
}
function scalar(value: JsonValue | undefined): string | undefined {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
export function detailFields(value: JsonValue | undefined): DetailField[] {
  const fields: DetailField[] = [];
  const visit = (item: JsonValue | undefined, prefix: string, depth: number) => {
    if (fields.length >= 64 || depth > 6) return;
    const leaf = scalar(item);
    if (leaf !== undefined) { fields.push({ key: prefix || "error", label: prefix || "上游信息", text: leaf }); return; }
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length && fields.length < 64; index++) visit(item[index], `${prefix}[${index}]`, depth + 1);
    } else for (const [key, child] of Object.entries(objectValue(item) ?? {})) {
      visit(child, prefix ? `${prefix}.${key}` : key, depth + 1);
      if (fields.length >= 64) break;
    }
  };
  visit(value, "", 0);
  return fields;
}

function memoryList(value: JsonValue | undefined) {
  if (!Array.isArray(value)) return undefined;
  return { count: value.length, items: value.flatMap((item, index): MemoryItem[] => {
    const row = objectValue(item); if (!row) return [];
    return [{ index, type: text(row.type), body: displayBody(row.content), scores: ["score", "vec_sim", "kw_score", "importance"].flatMap(key => {
      const number = row[key]; return typeof number === "number" && Number.isFinite(number) ? [{ key, label: key, text: number.toFixed(4) }] : [];
    }) }];
  }) };
}
/** Reads only the already sanitized public detail projection, never raw DTOs or private snapshots. */
export function diagnosticPresentation(value: JsonValue | undefined) {
  const row = objectValue(value) ?? {};
  const fields: DetailField[] = [];
  for (const key of ["话题", "召回查询", "关键词"]) if (text(row[key])) fields.push({ key, label: key, text: row[key] as string });
  if (typeof row["哨兵需要搜索"] === "boolean") fields.push({ key: "哨兵判断", label: "哨兵判断", text: row["哨兵需要搜索"] ? "需要搜索" : "无需搜索" });
  const count = row["上下文消息数"];
  if (typeof count === "number" && Number.isFinite(count) && count >= 0) fields.push({ key: "上下文消息数", label: "上下文消息数", text: `${count} 条` });
  for (const [key, label] of [["status", "任务状态"], ["source", "来源"], ["retries", "重试次数"], ["reason", "任务说明"], ["protocol_source", "协议来源"]]) {
    const leaf = scalar(row[key]); if (leaf !== undefined) fields.push({ key, label, text: leaf });
  }
  const notes = Array.isArray(row["生活速记"]) ? row["生活速记"].flatMap((item, index) => {
    const note = objectValue(item); if (!note) return [];
    const body = displayBody(note.output);
    if (!text(note.date) && !text(note.period_label) && !text(note.time_range) && body.kind === "missing") return [];
    return [{ index, date: text(note.date), period: text(note.period_label), range: text(note.time_range), body }];
  }) : undefined;
  const errorFields = detailFields(row["安全上游错误"]);
  if (text(row.error_code)) errorFields.unshift({ key: "error_code", label: "错误代码", text: row.error_code as string });
  return { fields, actual: memoryList(row["RAG 实际召回"]), candidates: memoryList(row["RAG 候选评分"]), notes,
    metadata: row["Provider 返回 metadata"] === null ? undefined : row["Provider 返回 metadata"], errorFields };
}

export type WireSection = { kind: "system" | "messages" | "tools" | "parameters"; entries: [string, JsonValue][] };
export type RequestPresentation = { kind: "grouped"; sections: WireSection[] } | { kind: "deferred" } | { kind: "raw" };
/** Categorization preserves top-level order and every value; it never rewrites protocol roles or content. */
export function requestPresentation(source: string, allowLarge = false): RequestPresentation {
  if (source.length > JSON_AUTO_TREE_CHARS && !allowLarge) return { kind: "deferred" };
  try {
    const parsed: JsonValue = JSON.parse(source);
    const object = objectValue(parsed); if (!object || Object.keys(object).length > 80) return { kind: "raw" };
    const sections: WireSection[] = [];
    for (const [key, value] of Object.entries(object)) {
      const kind = ["system", "systemInstruction", "system_instruction"].includes(key) ? "system"
        : ["messages", "contents"].includes(key) ? "messages" : key === "tools" ? "tools" : "parameters";
      const previous = sections[sections.length - 1];
      if (kind === "parameters" && previous?.kind === kind) previous.entries.push([key, value]);
      else sections.push({ kind, entries: [[key, value]] });
    }
    return { kind: "grouped", sections };
  } catch { return { kind: "raw" }; }
}
