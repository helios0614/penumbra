import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./registry-client";
import { canDeleteConnection, RegistryError } from "./registry-types";

export const connectionWire = (id = "a", configured = true) => ({ id, name: `合成连接 ${id}`, base_url: "https://synthetic.invalid/v1", enabled: true,
  default_model: "literal-outside-catalog", transport: "direct" as const, gateway_id: null,
  credential: { configured, masked: configured ? "••••1234" : "", secret_ref: configured ? `ref-${id}` : null } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const listWire = () => ({ schema_version: 2, authority_state: "projected_v2", migration_required: true, connections: [connectionWire()], diagnostics: [], deferred_usages: [] });
const fields = { name: "Synthetic", base_url: "https://synthetic.invalid/v1", transport: "direct" as const, enabled: true, default_model: null, gateway_id: null };

describe("Registry Connection v2 boundary", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => fetchMock(...args).then(response => response.clone())));
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });
  it("projects only safe fields and version facts, and makes no migration or reveal calls", async () => {
    fetchMock.mockResolvedValue(json({ ...listWire(), connections: [{ ...connectionWire(), key: "private-key", credential_ref: { secret: "private-source" } }], feature_bindings: [{ secret: "private-binding" }] }));
    const result = await api.listConnections();
    expect(result).toMatchObject({ authority_state: "projected_v2", migration_required: true });
    expect(JSON.stringify(result)).not.toMatch(/private-|credential_ref|feature_bindings/);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toMatchObject(["/api/registry/connections", { credentials: "include", cache: "no-store", method: "GET" }]);
  });
  it("encodes IDs, preserves unmodified credentials, and whitelists partial fields", async () => {
    const id = "id /?中文"; fetchMock.mockResolvedValue(json(connectionWire(id)));
    await api.getConnection(id);
    await api.updateConnection(id, { name: "Renamed", default_model: null, credential: null, secret_ref: "not-submitted" });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/registry/connections/${encodeURIComponent(id)}`);
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ name: "Renamed", default_model: null });
  });
  it("creates without a protocol and replaces using only the current ref", async () => {
    fetchMock.mockResolvedValue(json(connectionWire()));
    await api.createConnection({ ...fields, credential: "synthetic-new-key" });
    await api.updateConnection("a", { credential: "synthetic-replacement", secret_ref: "ref-a" });
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ ...fields, credential: "synthetic-new-key" });
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ credential: "synthetic-replacement", secret_ref: "ref-a" });
  });
  it.each(["", "  ", "••••1234", "***1234"])("rejects blank or masked credential %s without a request", async credential => {
    await expect(api.updateConnection("a", { credential })).rejects.toMatchObject({ code: "explicit_clear_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reveals and explicitly clears with a ref, never a masked value", async () => {
    fetchMock.mockResolvedValueOnce(json({ secret: "synthetic-key" })).mockResolvedValueOnce(json(connectionWire("a", false)));
    expect(await api.revealCredential("a", "ref-a")).toBe("synthetic-key");
    expect((await api.clearCredential("a", "ref-a")).credential.configured).toBe(false);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/registry/connections/a/credential/reveal", "/api/registry/connections/a/credential/clear"]);
    fetchMock.mock.calls.forEach(([, init]) => expect(JSON.parse(init!.body as string)).toEqual({ secret_ref: "ref-a" }));
  });
  it.each(["stale_secret_ref", "connection_in_use", "unresolved_selection_references", "selection_references_unavailable", "provider_probe_failed", "unsupported_protocol", "persistence_failed"])("retains safe %s classification and drops all raw error data", async code => {
    const privateValue = "private-synthetic-key";
    fetchMock.mockResolvedValue(json({ detail: { code, input: privateValue, body: privateValue } }, 409));
    const error = await api.updateConnection("a", { credential: privateValue, secret_ref: "ref-a" }).catch(error => error);
    expect(error).toBeInstanceOf(RegistryError); expect(error.code).toBe(code);
    expect(JSON.stringify(error) + String(error)).not.toContain(privateValue);
    expect(error).not.toHaveProperty("data");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    { references: [], unresolved: [], allowed: true },
    { references: [{ scope: "feature", id: "main_chat" }], unresolved: [], allowed: false },
    { references: [], unresolved: [{ scope: "diary", id: "broken", code: "invalid_selection" }], allowed: false },
  ])("fails closed for references $allowed", async ({ allowed, ...wire }) => {
    fetchMock.mockResolvedValue(json(wire));
    expect(canDeleteConnection(await api.getConnectionReferences("a"))).toBe(allowed);
    expect(canDeleteConnection(null)).toBe(false);
  });
  it("uses the explicit test triple and requires narrow success semantics", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, connection_id: "a", protocol: "anthropic_messages", model: "literal-x", test_type: "basic_nonstream", validates_full_chat: false }));
    await api.testConnection("a", "anthropic_messages", "literal-x");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ connection_id: "a", protocol: "anthropic_messages", model: "literal-x" });
    fetchMock.mockResolvedValue(json({ ok: true, connection_id: "wrong", protocol: "anthropic_messages", model: "literal-x", test_type: "basic_nonstream", validates_full_chat: false }));
    await expect(api.testConnection("a", "anthropic_messages", "literal-x")).rejects.toMatchObject({ code: "contract" });
  });
  it("uses protocol/query pagination identity and rejects mismatched responses", async () => {
    fetchMock.mockResolvedValue(json({ connection_id: "a", protocol: "anthropic_messages", operation: "model_list", models: ["literal/one"], truncated: true, next_page: "cursor/?" }));
    await api.discoverModels("a", "anthropic_messages", "previous /?");
    const url = new URL(String(fetchMock.mock.calls[0][0]), "https://synthetic.invalid");
    expect(url.searchParams.get("after_id")).toBe("previous /?");
    expect(url.searchParams.get("protocol")).toBe("anthropic_messages");
    await expect(api.discoverModels("a", "openai_chat_completions")).rejects.toMatchObject({ code: "contract" });
    await expect(api.discoverModels("a", "openai_chat_completions", "cursor")).rejects.toMatchObject({ code: "unsupported_pagination" });
  });
  it.each(["Bearer synthetic-private", "constructor", "not a code!"])("never echoes arbitrary errors %s", async code => {
    fetchMock.mockResolvedValue(json({ detail: { code, error: "synthetic-private" } }, 422));
    const error = await api.getConnection("a").catch(error => error);
    expect(error.message).not.toMatch(/synthetic-private|function Object/);
  });
});
