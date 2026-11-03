import { apiRequest, ApiError, type ApiRequestOptions } from "@/lib/api";
import { PROBE_PROTOCOLS, TRANSPORTS, RegistryError, validLiteral, validBaseUrl,
  type Connection, type ConnectionList, type ConnectionWrite, type ConnectionFields, type ConnectionReferences,
  type DiscoveredModels, type ProbeProtocol, type ProbeResult } from "./registry-types";

const base = "/api/registry/connections";
const path = (id: string) => `${base}/${encodeURIComponent(id)}`;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
function invalid(): never { throw new RegistryError("contract"); }
function diagnostic(value: unknown): string { return text(value) && /^[a-z][a-z0-9_]{0,95}$/.test(value) ? value : "unknown"; }

async function request(url: string, method: string, body?: Record<string, unknown>, options?: ApiRequestOptions): Promise<unknown> {
  try { return await apiRequest<unknown>(url, { ...options, method, body, cache: "no-store" }); }
  catch (error) {
    if (!(error instanceof ApiError)) throw new RegistryError("unknown");
    const data = record(error.data) && record(error.data.detail) ? error.data.detail : null;
    const providerCode = /\/test$/.test(url) && diagnostic(data?.code).startsWith("provider_") ? diagnostic(data?.code) : null;
    const code = providerCode ?? (error.status === 401 || error.status === 403 ? "unauthorized" :
      error.code === "TIMEOUT" ? "timeout" : error.code === "NETWORK_ERROR" ? "network" : diagnostic(data?.code));
    const safeMessage = /\/test$/.test(url) && text(data?.safe_message) ? data.safe_message.slice(0, 601) : undefined;
    throw new RegistryError(code, error.status, safeMessage);
  }
}
export function parseConnection(value: unknown, expectedId?: string): Connection {
  if (!record(value) || !text(value.id) || !value.id || (expectedId !== undefined && value.id !== expectedId) ||
    !text(value.name) || !text(value.base_url) || typeof value.enabled !== "boolean" ||
    !TRANSPORTS.includes(value.transport as never) || !(value.default_model == null || text(value.default_model)) ||
    !(value.gateway_id == null || text(value.gateway_id)) || !record(value.credential)) return invalid();
  const credential = value.credential;
  if (typeof credential.configured !== "boolean" || !text(credential.masked) || !(credential.secret_ref === null || text(credential.secret_ref)) ||
    (credential.configured && !credential.secret_ref)) return invalid();
  return { id: value.id, name: value.name, base_url: value.base_url, enabled: value.enabled,
    default_model: value.default_model ?? null, gateway_id: value.gateway_id ?? null, transport: value.transport as Connection["transport"],
    credential: { configured: credential.configured, masked: credential.masked, secret_ref: credential.secret_ref as string | null } };
}
export async function listConnections(options?: ApiRequestOptions): Promise<ConnectionList> {
  const raw = await request(base, "GET", undefined, options);
  if (!record(raw) || raw.schema_version !== 2 || !["projected_v2", "persisted_v2"].includes(String(raw.authority_state)) ||
    typeof raw.migration_required !== "boolean" || !Array.isArray(raw.connections) || !Array.isArray(raw.diagnostics) || !Array.isArray(raw.deferred_usages)) return invalid();
  const connections = raw.connections.map(item => parseConnection(item));
  if (new Set(connections.map(item => item.id)).size !== connections.length) return invalid();
  return { schema_version: 2, authority_state: raw.authority_state as ConnectionList["authority_state"], migration_required: raw.migration_required,
    connections, diagnosticCount: raw.diagnostics.length, deferredCount: raw.deferred_usages.length };
}
export async function getConnection(id: string, options?: ApiRequestOptions): Promise<Connection> {
  return parseConnection(await request(path(id), "GET", undefined, options), id);
}
export async function getConnectionReferences(id: string, options?: ApiRequestOptions): Promise<ConnectionReferences> {
  const raw = await request(`${path(id)}/references`, "GET", undefined, options);
  if (!record(raw) || !Array.isArray(raw.references) || !Array.isArray(raw.unresolved)) return invalid();
  const parse = (item: unknown) => {
    if (!record(item) || !text(item.scope) || !text(item.id)) return invalid();
    return { scope: item.scope, id: item.id };
  };
  return { references: raw.references.map(parse), unresolved: raw.unresolved.map(item => ({ ...parse(item), code: record(item) ? diagnostic(item.code) : "unknown" })) };
}
export function connectionWrite(input: ConnectionWrite, create = false): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of ["name", "base_url", "enabled", "default_model", "transport", "gateway_id"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) body[field] = input[field];
  }
  if ((create || input.name !== undefined) && (typeof input.name !== "string" || !input.name.trim())) throw new RegistryError("validation");
  if ((create || input.base_url !== undefined) && (typeof input.base_url !== "string" || !validBaseUrl(input.base_url))) throw new RegistryError("validation");
  if (input.default_model !== undefined && input.default_model !== null && !validLiteral(input.default_model)) throw new RegistryError("validation");
  if (input.transport !== undefined && !TRANSPORTS.includes(input.transport)) throw new RegistryError("validation");
  if (input.credential != null) {
    if (!input.credential.trim() || /[•●*]{3,}/.test(input.credential)) throw new RegistryError("explicit_clear_required");
    body.credential = input.credential;
    if (input.secret_ref) body.secret_ref = input.secret_ref;
  }
  return body;
}
export async function createConnection(input: ConnectionFields & { credential?: string }, options?: ApiRequestOptions) {
  return parseConnection(await request(base, "POST", connectionWrite(input, true), options));
}
export async function updateConnection(id: string, input: ConnectionWrite, options?: ApiRequestOptions) {
  return parseConnection(await request(path(id), "PATCH", connectionWrite(input), options), id);
}
export async function deleteConnection(id: string, options?: ApiRequestOptions) {
  const raw = await request(path(id), "DELETE", undefined, options);
  if (!record(raw) || raw.ok !== true) return invalid();
  return true;
}
export async function revealCredential(id: string, secretRef: string, options?: ApiRequestOptions): Promise<string> {
  const raw = await request(`${path(id)}/credential/reveal`, "POST", { secret_ref: secretRef }, options);
  if (!record(raw) || !text(raw.secret)) return invalid();
  return raw.secret;
}
export async function clearCredential(id: string, secretRef: string, options?: ApiRequestOptions): Promise<Connection> {
  return parseConnection(await request(`${path(id)}/credential/clear`, "POST", { secret_ref: secretRef }, options), id);
}
export async function testConnection(id: string, protocol: ProbeProtocol, model: string, options?: ApiRequestOptions, prompt?: string): Promise<ProbeResult> {
  if (!PROBE_PROTOCOLS.includes(protocol) || !validLiteral(model)) throw new RegistryError("validation");
  if (prompt !== undefined && (!prompt.trim() || [...prompt].length > 10000)) throw new RegistryError("invalid_test_prompt");
  const raw = await request(`${path(id)}/test`, "POST", { connection_id: id, protocol, model: model.trim(), ...(prompt === undefined ? {} : { prompt }) }, { timeoutMs: 35_000, ...options });
  if (!record(raw) || raw.connection_id !== id || raw.protocol !== protocol || raw.model !== model.trim() || raw.ok !== true ||
    raw.test_type !== "basic_nonstream" || raw.validates_full_chat !== false) return invalid();
  const count = (value: unknown) => value == null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
  if (prompt !== undefined && (!text(raw.content) || !count(raw.input_tokens) || !count(raw.output_tokens))) return invalid();
  return { ok: true, connection_id: id, protocol, model: raw.model as string, test_type: "basic_nonstream", validates_full_chat: false,
    ...(prompt === undefined ? {} : { content: raw.content as string, input_tokens: raw.input_tokens as number | null ?? null, output_tokens: raw.output_tokens as number | null ?? null }) };
}
export async function discoverModels(id: string, protocol: ProbeProtocol, afterId?: string, options?: ApiRequestOptions): Promise<DiscoveredModels> {
  if (afterId !== undefined && protocol !== "anthropic_messages") throw new RegistryError("unsupported_pagination");
  const raw = await request(`${path(id)}/fetch-models`, "POST", undefined,
    { timeoutMs: 35_000, ...options, query: { protocol, after_id: afterId } });
  if (!record(raw) || raw.connection_id !== id || raw.protocol !== protocol || raw.operation !== "model_list" ||
    !Array.isArray(raw.models) || !raw.models.every(text) || typeof raw.truncated !== "boolean" ||
    !(raw.next_page === null || text(raw.next_page))) return invalid();
  return { connection_id: id, protocol, operation: "model_list", models: raw.models as string[], truncated: raw.truncated, next_page: raw.next_page as string | null };
}
