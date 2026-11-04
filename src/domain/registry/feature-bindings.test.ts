import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFeatureBinding, listFeatureBindings, updateFeatureBinding } from "./registry-client";
import { FEATURE_GROUPS, featureScope, featureStatus, protocolName, type FeatureBinding, type FeatureUsage } from "./feature-bindings";
import { validLiteral } from "./registry-types";

const usages = FEATURE_GROUPS.flatMap(group => [...group.usages]);
const triple = { connection_id: "synthetic /?连接", protocol: "anthropic_messages", model: "catalog外/model-v99" };
const wire = (): { features: FeatureBinding[] } => ({ features: usages.map(usage => ({ usage, selection: { ...triple }, diagnostic: null,
  allowed_protocols: usage === "memory_sentinel" ? ["openai_chat_completions"] : ["anthropic_messages", "openai_chat_completions"],
  lifecycle: usage === "main_chat" || usage === "game_decision" ? "new_session_default" : usage === "book_annotation" ? "request_default" : "feature" })) });
describe("Feature Binding boundary", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  beforeEach(() => vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => fetchMock(...args).then(value => value.clone())));
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });
  it("reads exactly nine features from features[], preserving invalid selections, diagnostics, permissions and lifecycle", async () => {
    const raw = wire(); raw.features[0] = { ...raw.features[0], selection: { ...triple, protocol: "historical_protocol" }, diagnostic: "incompatible_protocol" };
    fetchMock.mockResolvedValue(json({ ...raw, feature_bindings: [], features: [...raw.features, { usage: "camera_core" }] }));
    expect(await listFeatureBindings()).toEqual(raw.features);
    expect(fetchMock.mock.calls[0]).toMatchObject(["/api/registry/feature-bindings", { method: "GET", cache: "no-store", credentials: "include" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["missing", "duplicate", "permissions", "selection"])("rejects malformed %s instead of inventing defaults", async kind => {
    const raw = wire();
    if (kind === "missing") raw.features.pop();
    if (kind === "duplicate") raw.features.push(raw.features[0]);
    if (kind === "permissions") raw.features[0] = { ...raw.features[0], allowed_protocols: [1] as never };
    if (kind === "selection") raw.features[0] = { ...raw.features[0], selection: { profile_id: "old" } as never };
    fetchMock.mockResolvedValue(json(raw)); await expect(listFeatureBindings()).rejects.toMatchObject({ code: "contract" });
  });
  it("writes only one complete triple with literal intact, then explicitly deletes without an empty body", async () => {
    const usage = "memory_digest /?" as FeatureUsage;
    fetchMock.mockResolvedValueOnce(json({ usage, ...triple })).mockResolvedValueOnce(json({ ok: true }));
    await updateFeatureBinding(usage, { ...triple, model: ` ${triple.model} `, other: "discard" } as never);
    await clearFeatureBinding(usage);
    const calls = fetchMock.mock.calls;
    expect(calls[0][0]).toBe(`/api/registry/feature-bindings/${encodeURIComponent(usage)}`);
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual(triple);
    expect(calls[1][1]).toMatchObject({ method: "DELETE", credentials: "include", cache: "no-store" });
    expect(calls[1][1]!.body).toBeUndefined(); expect(calls).toHaveLength(2);
  });
  it.each(["missing_credential", "disabled_profile", "incompatible_protocol", "persistence_failed"])("retains safe write error %s without replay", async code => {
    fetchMock.mockResolvedValue(json({ detail: { code, input: "synthetic-private" } }, 422));
    const error = await updateFeatureBinding("main_chat", triple).catch(error => error);
    expect(error.code).toBe(code); expect(JSON.stringify(error)).not.toContain("synthetic-private"); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["", "two words", "line\nmodel", "\tmodel", "x\u200b", "x".repeat(257)])("rejects invalid backend literal %j", async model => {
    expect(validLiteral(model)).toBe(false);
    await expect(updateFeatureBinding("main_chat", { ...triple, model })).rejects.toMatchObject({ code: "validation" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("localizes protocol labels without changing enum values or unknown historical labels", () => {
    expect(protocolName("openai_chat_completions")).toBe("OpenAI 对话补全");
    expect(protocolName("anthropic_messages")).toBe("Anthropic 消息接口");
    expect(protocolName("minimax_chatcompletion_v2")).toBe("MiniMax 对话接口 v2");
    expect(protocolName("historical_protocol")).toBe("historical_protocol");
  });
  it("uses backend diagnostics rather than the presence of a triple", () => {
    const feature = wire().features[0];
    for (const diagnostic of ["disabled_profile", "missing_credential", "missing_profile", "incompatible_protocol", "arbitrary_diagnostic"]) {
      expect(featureStatus({ ...feature, diagnostic })).not.toContain("当前可用");
    }
    expect(featureStatus(feature)).toContain("当前可用");
    expect(featureStatus({ ...feature, selection: null, diagnostic: "feature_binding_required" })).toBe("未配置");
    expect(featureScope(feature)).toContain("不修改已有会话");
    expect(featureScope(wire().features.find(item => item.usage === "game_decision")!)).toContain("不修改已有 Session");
    expect(featureScope({ ...feature, lifecycle: "future_lifecycle" })).toContain("需核对");
    expect(featureStatus({ ...feature, diagnostic: "constructor" })).toBe("Registry 诊断异常");
    expect(protocolName("__proto__")).toBe("__proto__");
  });
});
