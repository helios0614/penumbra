import { apiRequest, ApiError, type ApiRequestOptions } from "@/lib/api";

export type CredentialMode = "query_token" | "path_segment";
export interface Credential { configured: boolean; masked: string; secret_ref: string | null }
/** The nested config and camelCase server list are deliberately separate wire contracts. */
export interface MCPConfigDTO { enabled: boolean; servers: Record<string, unknown> }
export interface MCPServerDTO {
  name: string; displayName: string; url: string; url_diagnostic?: string | null;
  credentialMode: string; enabled: boolean; status: string; lastConnected: number; credential: Credential;
}
export interface MCPServer extends MCPServerDTO {}
export interface MCPTool { name: string; description: string; inputSchema: unknown; enabled: boolean }
export interface TestResult { success: boolean; count: number; error: string | null }
export class MCPError extends Error {
  constructor(readonly code: string, readonly status = 0) {
    super(({
      stale_secret_ref: "凭据引用已过期。已请求重新读取，请核对后再次确认操作。",
      ambiguous_url: "地址存在歧义，无法清除凭据。请先编辑并手动修正地址。",
      topology_changed: "工具拓扑已变化。请核对重新读取的服务器和工具，再手动操作。",
      contract: "服务器响应格式不符合 MCP 契约。", validation: "请检查必填字段、凭据模式和输入范围。",
      readback: "操作已保存，但安全读回失败。请刷新核对，勿重复提交。",
    } as Record<string, string>)[code] ?? ({
      400: "当前状态不允许此操作。工具加载要求服务器已启用。", 401: "Session 已失效，请重新登录。",
      403: "当前 Session 没有配置权限。", 404: "服务器或工具不存在，请刷新。", 409: "配置已变化，请刷新核对后再次操作。",
      422: "参数或凭据模式无效，请检查地址与凭据。", 503: "工具列表恢复失败，请稍后手动重试。",
    } as Record<number, string>)[status] ?? "请求失败，请检查网络或稍后手动重试。");
    this.name = "MCPError";
  }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const invalid = (): never => { throw new MCPError("contract"); };
const base = "/api/mcp";
const serverPath = (id: string) => `${base}/servers/${encodeURIComponent(id)}`;
async function request(path: string, method = "GET", body?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  try { return await apiRequest(path, { method, body, signal, cache: "no-store", credentials: "include", timeoutMs: 35_000 } satisfies ApiRequestOptions); }
  catch (e) {
    // Never retain an ApiError, raw response, request URL, or cause in page state.
    if (!(e instanceof ApiError)) throw new MCPError("network");
    const detail = record(e.data) ? e.data.detail : null;
    const code = record(detail) ? detail.code : record(e.data) ? e.data.code : null;
    if (code === "stale_secret_ref" || detail === "Secret reference is invalid or stale") throw new MCPError("stale_secret_ref", e.status);
    if (detail === "MCP URL is ambiguous; replace endpoint explicitly") throw new MCPError("ambiguous_url", e.status);
    throw new MCPError(code === "topology_changed" || e.status === 409 ? "topology_changed" : "request", e.status);
  }
}
export async function getMCPEnabled(signal?: AbortSignal): Promise<boolean> {
  const raw = await request(`${base}/config`, "GET", undefined, signal);
  if (!record(raw) || typeof raw.enabled !== "boolean" || !record(raw.servers)) return invalid();
  // Only the global field is consumed here; server cards use the list adapter.
  return raw.enabled;
}
export function parseServer(raw: unknown): MCPServer {
  if (!record(raw) || typeof raw.name !== "string" || !raw.name || typeof raw.displayName !== "string" || typeof raw.url !== "string" ||
    typeof raw.credentialMode !== "string" || typeof raw.enabled !== "boolean" || typeof raw.status !== "string" ||
    typeof raw.lastConnected !== "number" || !Number.isFinite(raw.lastConnected) || !record(raw.credential) ||
    typeof raw.credential.configured !== "boolean" || typeof raw.credential.masked !== "string" ||
    !(raw.credential.secret_ref == null || typeof raw.credential.secret_ref === "string") ||
    !(raw.url_diagnostic == null || typeof raw.url_diagnostic === "string")) return invalid();
  return { name: raw.name, displayName: raw.displayName, url: raw.url, credentialMode: raw.credentialMode, enabled: raw.enabled,
    status: raw.status, lastConnected: raw.lastConnected, url_diagnostic: raw.url_diagnostic as string | null ?? null,
    credential: { configured: raw.credential.configured, masked: raw.credential.masked, secret_ref: raw.credential.secret_ref as string | null ?? null } };
}
export async function listServers(signal?: AbortSignal): Promise<MCPServer[]> {
  const raw = await request(`${base}/servers`, "GET", undefined, signal);
  if (!Array.isArray(raw)) return invalid();
  const servers = raw.map(parseServer);
  if (new Set(servers.map(s => s.name)).size !== servers.length) return invalid();
  return servers;
}
async function write(path: string, method: string, body?: Record<string, unknown>, signal?: AbortSignal) {
  const raw = await request(path, method, body, signal);
  if (!record(raw) || raw.ok !== true) return invalid();
  return true;
}
export const setMCPEnabled = (enabled: boolean, signal?: AbortSignal) => write(`${base}/config`, "PUT", { enabled }, signal);
export const createServer = (body: Record<string, unknown>, signal?: AbortSignal) => write(`${base}/servers`, "POST", body, signal);
export const updateServer = (id: string, body: Record<string, unknown>, signal?: AbortSignal) => write(serverPath(id), "PUT", body, signal);
export const deleteServer = (id: string, signal?: AbortSignal) => write(serverPath(id), "DELETE", undefined, signal);
export const clearSecret = (ref: string, signal?: AbortSignal) => write(`${base}/secrets/clear`, "POST", { secret_ref: ref }, signal);
export async function revealSecret(ref: string, signal?: AbortSignal): Promise<string> {
  const raw = await request(`${base}/secrets/reveal`, "POST", { secret_ref: ref }, signal);
  if (!record(raw) || typeof raw.secret !== "string") return invalid();
  return raw.secret;
}
export const revealedKind = (secret: string) => /^https?:\/\//i.test(secret) ? "完整私有 Endpoint（历史内嵌凭据）" : "独立 Token";
export async function testServer(id: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<TestResult> {
  if (body.token && body.secret_ref) throw new MCPError("validation");
  const raw = await request(`${serverPath(id)}/test`, "POST", body, signal);
  if (!record(raw) || typeof raw.success !== "boolean" || !Array.isArray(raw.tools)) return invalid();
  // Current backend only exposes these two fixed, safe errors, no HTTP diagnostic DTO.
  const error = raw.error === "连接超时" || raw.error === "连接失败" ? raw.error : raw.success ? null : "连接失败";
  return { success: raw.success, count: raw.tools.length, error };
}
export async function listTools(id: string, signal?: AbortSignal): Promise<MCPTool[]> {
  const raw = await request(`${serverPath(id)}/tools`, "GET", undefined, signal);
  if (!record(raw) || raw.server !== id || !Array.isArray(raw.tools)) return invalid();
  return raw.tools.map(item => {
    if (!record(item) || typeof item.name !== "string" || !item.name || !(item.description == null || typeof item.description === "string") || typeof item.enabled !== "boolean") return invalid();
    return { name: item.name, description: item.description as string ?? "", inputSchema: item.inputSchema ?? {}, enabled: item.enabled };
  });
}
export const toggleTool = (id: string, name: string, enabled: boolean, signal?: AbortSignal) => write(`${serverPath(id)}/tools`, "PUT", { name, enabled }, signal);
export const validDepth = (value: string) => /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 20;
export async function getDepth(signal?: AbortSignal): Promise<number> {
  const raw = await request("/api/settings", "GET", undefined, signal);
  if (!record(raw)) return invalid();
  const value = raw.mcp_max_chain_depth ?? 5;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 20) return invalid();
  return value;
}
export async function saveDepth(value: string, signal?: AbortSignal) {
  if (!validDepth(value)) throw new MCPError("validation");
  await write("/api/settings", "PUT", { mcp_max_chain_depth: Number(value) }, signal);
  const result = await getDepth(signal);
  if (result !== Number(value)) throw new MCPError("readback");
  return result;
}
export function verification(server: Pick<MCPServer, "status" | "lastConnected">) {
  if (server.lastConnected <= 0 && server.status !== "online") return "尚未验证";
  return server.status === "online" ? "上次验证成功" : server.status === "offline" ? "上次验证失败" : "验证状态未知";
}

export const credentialModeLabel = (mode: string) => mode === "query_token" ? "查询参数" : mode === "path_segment" ? "路径段" : "不支持的凭据模式";
