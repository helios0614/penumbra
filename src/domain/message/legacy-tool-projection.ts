/** Compatibility for existing structured carriers, never for system.content. */
const privateKey = /api[_-]?key|token|secret|password|authorization|credential|cookie|prompt|evidence|context|screenshot|image|device[_-]?id|binding[_-]?id/i;
const credential = /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?([^\s,;"'<>}&]+)/gi;
function safeText(value: string): string {
  return value.replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g, "$1<redacted>@")
    .replace(credential, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "<redacted>");
}
function safeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeValue);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, privateKey.test(key) ? "[已隐藏]" : safeValue(v)]));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) return JSON.stringify(safeValue(parsed), null, 2);
    } catch { /* The legacy result can be plain text. */ }
    return safeText(value);
  }
  return value;
}
export function projectLegacyTools(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
    const c = raw as Record<string, unknown>;
    const named = typeof c.server === "string" && typeof c.tool === "string";
    const location = c.command_type === "POI_SEARCH" || c.command_type === "ROUTE_PLAN";
    if ((!named && !location) || (typeof c.result !== "string" && typeof c.error !== "string")) return [];
    const result: Record<string, unknown> = {};
    // Exact public/storage fields only. Never forward raw_command or a remote
    // dictionary wholesale; old servers have no configured-secret projection.
    for (const key of ["server", "tool", "command_type", "args", "executed_args", "result", "error", "ai_result",
      "args_truncated", "executed_args_truncated", "command_truncated", "storage_truncated", "ai_truncated", "original_length", "result_version"]) {
      if (c[key] !== undefined) result[key] = safeValue(c[key]);
    }
    result.status = typeof c.execution_status === "string" ? c.execution_status : c.success === true ? "success" : c.success === false ? "failed" : "unknown";
    result.ai_delivery = c.ai_included === false ? "not_included" : "unknown";
    return [result];
  });
}
