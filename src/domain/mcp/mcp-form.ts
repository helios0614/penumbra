import { MCPError, type MCPServer } from "./mcp-client";
export interface ServerDraft { id: string; displayName: string; url: string; mode: string; token: string; endpoint: string; enabled: boolean }
export function serverDraft(server?: MCPServer): ServerDraft {
  return { id: server?.name ?? "", displayName: server?.displayName ?? "", url: server?.url ?? "", mode: server?.credentialMode ?? "query_token", token: "", endpoint: "", enabled: server?.enabled ?? false };
}
export function serverBody(draft: ServerDraft, server?: MCPServer): Record<string, unknown> {
  if (!draft.id.trim() || !draft.displayName.trim() || (!draft.url.trim() && !draft.endpoint && !server?.url_diagnostic) ||
    (draft.token.length > 0 && !draft.token.trim()) || !["query_token", "path_segment"].includes(draft.mode)) throw new MCPError("validation");
  if (draft.mode === "path_segment" && (!server || server.credentialMode !== draft.mode) && !draft.endpoint) throw new MCPError("validation");
  if (server && server.credential.configured && !server.credential.secret_ref) throw new MCPError("stale_secret_ref");
  const body: Record<string, unknown> = { display_name: draft.displayName.trim(), url: draft.endpoint || draft.url.trim(), enabled: draft.enabled };
  if (!server) body.name = draft.id.trim();
  if (!server || server.credentialMode !== draft.mode) body.credential_mode = draft.mode;
  if (draft.mode === "query_token" && draft.token) body.token = draft.token;
  if (server?.credential.secret_ref) body.secret_ref = server.credential.secret_ref;
  return body;
}
export function draftTestBody(draft: ServerDraft, server?: MCPServer) {
  const body = serverBody(draft, server);
  if (!body.url || (server?.credential.configured && draft.url !== server.url && !draft.token && !draft.endpoint)) throw new MCPError("validation");
  return { url: body.url, credential_mode: draft.mode,
    ...(draft.token && draft.mode === "query_token" ? { token: draft.token } : draft.endpoint ? {} : server?.credential.secret_ref ? { secret_ref: server.credential.secret_ref } : {}) };
}
