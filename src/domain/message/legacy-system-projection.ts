import type { CapabilityRecord } from "./capability-types";

export const LEGACY_TEXT_LIMIT = 256_000;
const credentialKey = /api[_-]?key|token|secret|password|authorization|credential|cookie/i;
const quotedCredential = /((?:api[_-]?key|token|secret|password|authorization|credential|cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi;
const credential = /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?([^\s,;"'<>}&]+)/gi;

/** Plain text only at render time. Prompt wording is not a credential category. */
export function redactLegacyText(value: string): string {
  return value.replace(quotedCredential, "$1<redacted>")
    .replace(/\b((?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*/gi, "$1<redacted>")
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g, "$1<redacted>@")
    .replace(credential, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "<redacted>")
    .replace(/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=\r\n]+/gi, "[已隐藏图片数据]");
}
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, credentialKey.test(key) ? "<redacted>" : clean(v)]));
  return typeof value === "string" ? redactLegacyText(value) : value;
}
export function projectLegacySystemText(value: unknown): CapabilityRecord | null {
  if (typeof value !== "string") return null;
  let text = value.replace(/^\[delayed\]/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { /* Ordinary legacy prose. */ }
  try {
    text = typeof parsed === "object" && parsed !== null ? JSON.stringify(clean(parsed), null, 2) : redactLegacyText(text);
  } catch {
    return { kind:"operation", capability:"legacy", title:"历史系统记录", status:"unknown", fields:[], calls:[],
      notices:["旧文本结构过于复杂，无法安全处理；原始持久化内容未修改。"] };
  }
  if (!text.trim()) return null;
  const notices = ["保留旧版系统文本；不据此推断执行状态或调用身份。"];
  if (text.length > LEGACY_TEXT_LIMIT) notices.push(`旧文本达到展示上限，仅展示前 ${LEGACY_TEXT_LIMIT} 字符；原持久化内容与 AI 历史未修改。`);
  return { kind: "operation", capability: "legacy-text", title: "旧版系统内容", status: "unknown",
    fields: [{ label: "旧版系统原文", text: text.slice(0, LEGACY_TEXT_LIMIT) }], notices, calls: [],
    preview: text.trim().slice(0, 240) + (text.trim().length > 240 ? "…" : ""), previewLines: 2 };
}
