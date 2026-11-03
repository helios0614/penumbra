export const TRANSPORTS = ["direct", "cloudflare_rest", "cloudflare_anthropic"] as const;
export type Transport = typeof TRANSPORTS[number];
// Probe capabilities, never a property or whitelist on a Connection.
export const PROBE_PROTOCOLS = ["openai_chat_completions", "anthropic_messages", "minimax_chatcompletion_v2"] as const;
export type ProbeProtocol = typeof PROBE_PROTOCOLS[number];
export interface Connection {
  readonly id: string;
  readonly name: string;
  readonly base_url: string;
  readonly enabled: boolean;
  readonly default_model: string | null;
  readonly transport: Transport;
  readonly gateway_id: string | null;
  readonly credential: { readonly configured: boolean; readonly masked: string; readonly secret_ref: string | null };
}
export interface ConnectionList {
  readonly schema_version: 2;
  readonly authority_state: "projected_v2" | "persisted_v2";
  readonly migration_required: boolean;
  readonly connections: readonly Connection[];
  readonly diagnosticCount: number;
  readonly deferredCount: number;
}
export interface ConnectionFields {
  name: string;
  base_url: string;
  enabled: boolean;
  default_model: string | null;
  transport: Transport;
  gateway_id: string | null;
}
export type ConnectionWrite = Partial<ConnectionFields> & { credential?: string | null; secret_ref?: string };
export interface ConnectionReferences {
  readonly references: readonly { readonly scope: string; readonly id: string }[];
  readonly unresolved: readonly { readonly scope: string; readonly id: string; readonly code: string }[];
}
export interface ProbeResult {
  readonly ok: true;
  readonly connection_id: string;
  readonly protocol: ProbeProtocol;
  readonly model: string;
  readonly test_type: "basic_nonstream";
  readonly validates_full_chat: false;
  readonly content?: string;
  readonly input_tokens?: number | null;
  readonly output_tokens?: number | null;
}
export interface DiscoveredModels {
  readonly connection_id: string;
  readonly protocol: ProbeProtocol;
  readonly operation: "model_list";
  readonly models: readonly string[];
  readonly truncated: boolean;
  readonly next_page: string | null;
}
// Only safe classifications survive the API boundary, never API data/input/body.
export class RegistryError extends Error {
  constructor(readonly code: string, readonly status = 0, readonly safeMessage?: string) { super(registryErrorCopy(code)); this.name = "RegistryError"; }
}
const errors: Readonly<Record<string, string>> = {
  invalid_test_prompt: "测试内容须为 1–10000 个字符。",
  provider_timeout: "上游请求超时。",
  provider_connection_failed: "无法连接上游服务。",
  provider_authentication_failed: "上游认证失败，请检查此连接的凭据。",
  provider_http_error: "上游返回 HTTP 错误。",
  provider_response_error: "上游返回错误。",
  invalid_provider_response: "上游响应无法解析为普通文本结果。",
  stale_secret_ref: "凭据快照已过期。请重新读取连接，核对后再次明确操作。",
  invalid_secret_ref: "凭据引用不可用，请重新读取连接后核对。",
  explicit_clear_required: "空白 Key 不能提交；请使用显式清除操作。",
  missing_credential: "此连接尚未配置 API Key。",
  disabled_profile: "此连接已停用。",
  missing_profile: "此连接已不存在，请返回列表重新读取。",
  connection_in_use: "连接仍被引用，不能删除。请重新读取引用。",
  profile_in_use: "连接仍被业务或历史兼容引用，不能删除。",
  unresolved_selection_references: "存在无法解析的引用，不能删除。",
  selection_references_unavailable: "无法核对连接引用，暂不能删除。",
  unsupported_protocol: "当前连接不支持此操作所选的协议。",
  incompatible_protocol: "当前 Transport 与所选测试协议不兼容。",
  unsupported_pagination: "当前协议不支持分页，请保留手动输入。",
  provider_probe_failed: "本次上游请求失败；可检查配置后手动重试。",
  persistence_failed: "配置保存失败，请读取当前状态核对结果。",
  secret_signing_unavailable: "凭据安全服务暂不可用，请稍后重新读取。",
  invalid_connection: "连接字段无效，请检查输入。",
  invalid_registry_configuration: "Registry 配置暂不可读取。",
  validation: "请检查名称、服务基础地址和模型名称；Key 不能提交空白或掩码。",
  unauthorized: "当前 Session 没有读取或操作权限，请确认登录状态。",
  network: "请求连接失败；写入结果可能尚未确认，请先读取核对。",
  timeout: "请求超时；写入结果可能尚未确认，请先读取核对。",
  contract: "响应不符合 Registry 安全契约，请重新读取核对。",
  unknown: "本次操作未完成，请读取当前状态后再决定是否重试。",
};
export function registryErrorCopy(code: string): string {
  return Object.prototype.hasOwnProperty.call(errors, code) ? errors[code] : errors.unknown;
}
export function canDeleteConnection(refs: ConnectionReferences | null): boolean {
  return refs !== null && refs.references.length === 0 && refs.unresolved.length === 0;
}
export function validLiteral(value: string): boolean {
  const text = value.trim();
  return [...text].length >= 1 && [...text].length <= 256 && !/[\s\p{C}]/u.test(text);
}
export function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash &&
      !/\/(?:chat\/completions|messages|text\/chatcompletion_v2)\/?$/.test(url.pathname) && !/:(?:streamGenerateContent|generateContent)/.test(url.pathname);
  } catch { return false; }
}
export function displayBaseUrl(value: string): string {
  try { const url = new URL(value); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.toString().replace(/\/$/, ""); }
  catch { return value && !/[?@#]/.test(value) ? value : "基础地址需要核对"; }
}
