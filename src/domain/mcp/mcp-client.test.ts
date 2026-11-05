import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSecret, createServer, getDepth, getMCPEnabled, listServers, listTools, MCPError, parseServer, revealedKind, revealSecret, saveDepth, setMCPEnabled, testServer, toggleTool, updateServer, validDepth, verification } from "./mcp-client";
import { draftTestBody, serverBody, serverDraft } from "./mcp-form";
const fixture = (extra = {}) => ({ name: "a /?", displayName: "合成服务", url: "https://fake.invalid/sse", credentialMode: "query_token", enabled: true, status: "offline", lastConnected: 0, credential: { configured: true, masked: "••••", secret_ref: "ref-now" }, ...extra });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); });
describe("MCP safe API and DTO contracts", () => {
  it("reads global config separately, drops extra fields, and accepts an unavailable signing reference", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ enabled: false, servers: {} })).mockResolvedValueOnce(response([fixture({ credential: { configured: true, masked: "••••", secret_ref: null }, token: "must-drop" })])); vi.stubGlobal("fetch", fetch);
    expect(await getMCPEnabled()).toBe(false); const servers = await listServers(); expect(servers[0].credential.secret_ref).toBeNull(); expect(servers[0]).not.toHaveProperty("token");
    for (const [, init] of fetch.mock.calls) { expect(init.cache).toBe("no-store"); expect(init.credentials).toBe("include"); }
    expect(() => parseServer({ enabled: false, servers: {} })).toThrow(MCPError);
  });
  it("writes only the global switch, encodes IDs, and sends exact tool mutations", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response({ ok: true })); vi.stubGlobal("fetch", fetch);
    await setMCPEnabled(false); await toggleTool("a /?", "same-name", false);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ enabled: false });
    expect(fetch.mock.calls[1][0]).toContain("/a%20%2F%3F/tools"); expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({ name: "same-name", enabled: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not equate HTTP 200 with test success, and never returns raw diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ success: false, tools: [], error: "raw-private-endpoint", raw: "secret" })));
    expect(await testServer("new", { url: "https://fake.invalid" })).toEqual({ success: false, count: 0, error: "连接失败" });
    await expect(testServer("new", { token: "new", secret_ref: "ref" })).rejects.toThrow(MCPError);
  });
  it.each([400, 401, 403, 404, 409, 422, 503])("maps HTTP %s without retaining raw body, URL or exception", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ detail: "raw-secret-private-endpoint" }, status)));
    try { await listServers(); throw new Error("expected rejection"); } catch (error) { expect(error).toBeInstanceOf(MCPError); expect(JSON.stringify(error)).not.toContain("raw-secret"); expect((error as Error).message).not.toContain("raw-secret"); }
  });
  it("handles both stale reference contracts and ambiguity precisely without retry", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ detail: "Secret reference is invalid or stale" }, 422)).mockResolvedValueOnce(response({ detail: { code: "stale_secret_ref" } }, 409)).mockResolvedValueOnce(response({ detail: "MCP URL is ambiguous; replace endpoint explicitly" }, 422)); vi.stubGlobal("fetch", fetch);
    await expect(revealSecret("ref")).rejects.toMatchObject({ code: "stale_secret_ref" }); await expect(clearSecret("ref")).rejects.toMatchObject({ code: "stale_secret_ref" }); await expect(clearSecret("ref")).rejects.toMatchObject({ code: "ambiguous_url" }); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("keeps reveal types separate and isolates identical tool names by server", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ secret: "synthetic-token" })).mockResolvedValueOnce(response({ secret: "https://mock.invalid/private/synthetic" })).mockResolvedValueOnce(response({ server: "one", tools: [{ name: "same", description: "<script>unsafe</script>", inputSchema: { x: "<img>" }, enabled: true }] })).mockResolvedValueOnce(response({ server: "two", tools: [{ name: "same", enabled: false }] })); vi.stubGlobal("fetch", fetch);
    expect(revealedKind(await revealSecret("a"))).toBe("独立 Token"); expect(revealedKind(await revealSecret("b"))).toContain("完整私有 Endpoint");
    expect((await listTools("one"))[0].enabled).toBe(true); expect((await listTools("two"))[0].enabled).toBe(false);
  });
  it("advanced settings defaults to 5 and only writes the intended field with readback", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ other: "untouched" })).mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ mcp_max_chain_depth: 0, other: "untouched" })); vi.stubGlobal("fetch", fetch);
    expect(await getDepth()).toBe(5); expect(await saveDepth("0")).toBe(0); expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({ mcp_max_chain_depth: 0 });
    expect(validDepth("20")).toBe(true); for (const value of ["-1", "21", "1.5", "", "NaN"]) { expect(validDepth(value)).toBe(false); await expect(saveDepth(value)).rejects.toThrow(MCPError); }
  });
  it("reports a mismatched advanced readback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ mcp_max_chain_depth: 5 })));
    await expect(saveDepth("20")).rejects.toMatchObject({ code: "readback" });
  });
});
describe("server drafts and preserved credentials", () => {
  it("creates disabled by default, keeps a stable ID, omits empty token and unchanged mode", async () => {
    const server = parseServer(fixture()), draft = serverDraft(server); draft.displayName = "rename";
    expect(serverBody(draft, server)).toEqual({ display_name: "rename", url: server.url, enabled: true, secret_ref: "ref-now" });
    const fresh = serverDraft(); expect(fresh.enabled).toBe(false); fresh.id = "new"; fresh.displayName = "new"; fresh.url = "https://mock.invalid";
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response({ ok: true })); vi.stubGlobal("fetch", fetch); await createServer(serverBody(fresh)); await updateServer(server.name, serverBody(draft, server)); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("replaces credentials using the current ref and never sends token together with a probe ref", () => {
    const server = parseServer(fixture()), draft = serverDraft(server); draft.token = "synthetic-new";
    expect(serverBody(draft, server)).toMatchObject({ token: "synthetic-new", secret_ref: "ref-now" });
    expect(draftTestBody(draft, server)).not.toHaveProperty("secret_ref"); draft.token = ""; expect(draftTestBody(draft, server)).toHaveProperty("secret_ref", "ref-now");
    draft.url = "https://changed.invalid"; expect(() => draftTestBody(draft, server)).toThrow(MCPError);
  });
  it("does not reconstruct private path URLs, requires an explicit replacement after mode change", () => {
    const server = parseServer(fixture({ credentialMode: "path_segment", url: "https://mock.invalid/base" })), draft = serverDraft(server);
    expect(draft.endpoint).toBe(""); expect(serverBody(draft, server).url).toBe(server.url);
    draft.endpoint = "https://mock.invalid/base/synthetic-new"; expect(serverBody(draft, server)).not.toHaveProperty("token"); expect(draftTestBody(draft, server)).not.toHaveProperty("secret_ref");
    const fresh = serverDraft(); Object.assign(fresh, { id: "new", displayName: "new", mode: "path_segment", url: "https://mock.invalid" }); expect(() => serverBody(fresh)).toThrow(MCPError);
  });
  it("preserves diagnostic empty projection and unknown modes until explicitly corrected", () => {
    const server = parseServer(fixture({ url: "", url_diagnostic: "ambiguous" })), draft = serverDraft(server);
    expect(serverBody(draft, server).url).toBe(""); expect(() => draftTestBody(draft, server)).toThrow(MCPError);
    const unknown = serverDraft(parseServer(fixture({ credentialMode: "unknown" }))); expect(unknown.mode).toBe("unknown"); expect(() => serverBody(unknown)).toThrow(MCPError);
  });
  it("interprets Unix seconds and distinguishes untouched offline servers", () => {
    expect(verification({ status: "offline", lastConnected: 0 })).toBe("尚未验证"); expect(verification({ status: "online", lastConnected: 1700000000 })).toBe("上次验证成功"); expect(verification({ status: "offline", lastConnected: 1700000000 })).toBe("上次验证失败");
  });
});
