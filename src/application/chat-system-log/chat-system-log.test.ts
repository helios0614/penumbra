import { describe, expect, it } from "vitest";
import { createSystemLogStore, REQUEST_MEMORY_BYTES } from "./chat-system-log-store";
import { projectDiagnostic, publicText, publicHttpMetadata } from "./chat-system-log-projection";
const context = (id: string, kind: "send" | "regenerate" = "send") => ({ executionId: id, conversationId: "a", kind, targetId: kind === "regenerate" ? "same-target" : undefined });
const snapshot = (id: string, execution = "send:a", payload = '{"messages":[]}') => ({ id, execution_id: execution, conversation_id: "a", kind: "send", created_at: Date.now() / 1000 + Number(id.replace(/\D/g, "") || 0) / 1000, model: "actual-model", protocol: "openai", source: "main", payload_json: payload, stage: "http_json_before_send", complete: true, limitations: [] });
describe("page system log", () => {
  it("preserves safe HTTP type/code/request identity without requiring a message", () => {
    expect(publicHttpMetadata({ detail: { type: "permission_error", code: "regional_policy", request_id: "req-synthetic", upstream_message: "synthetic region is unavailable", prompt: "PRIVATE_PROMPT", authorization: "SECRET" } })).toContain("synthetic region is unavailable");
    expect(publicHttpMetadata({ code: "no_body", request_id: "synthetic" })).toContain("no_body");
    expect(publicHttpMetadata({ prompt: "PRIVATE_PROMPT", headers: { Cookie: "SECRET" } })).toBeUndefined();
  });
  it("merges WS before/after SSE by a confirmed send identity and retains richer fields", () => {
    const store = createSystemLogStore(), owner = context("send:a");
    store.begin(owner);
    store.diagnostic({ msg_id: "assistant", model: "m", has_error: false, usage: { prompt_tokens: 0 } }, "ws");
    store.diagnostic({ msg_id: "assistant", has_error: false, api_format: "anthropic", api_response: { events: [] } }, "sse", owner);
    store.diagnostic({ msg_id: "assistant", has_error: false, usage: { completion_tokens: 3 } }, "ws");
    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().entries[0]).toMatchObject({ usage: { prompt_tokens: 0, completion_tokens: 3 }, protocol: "anthropic", details: { "Provider 返回 metadata": { events: [] } } });
  });
  it("retains real upstream details when the connection later fails", () => {
    const store = createSystemLogStore(), owner = context("send:a");
    store.begin(owner);
    store.diagnostic({ msg_id: "m", has_error: true, error_text: "[请求出错: provider_execution_failed]\n上游信息：synthetic policy reason" }, "sse", owner);
    store.issue(owner, "连接中断");
    expect(store.getState().entries[0].error).toContain("synthetic policy reason");
    expect(store.getState().entries[0].hasError).toBe(true);
  });
  it("keeps two regenerates and the original send separate on the same target", () => {
    const store = createSystemLogStore();
    for (const owner of [context("send:a"), context("regen:1", "regenerate"), context("regen:2", "regenerate")]) {
      store.begin(owner); store.diagnostic({ msg_id: "same-target", has_error: false }, "sse", owner);
    }
    expect(store.getState().entries.map(row => row.id).sort()).toEqual(["regen:1", "regen:2", "send:a"]);
  });
  it("does not associate an unknown WS record with the current execution", () => {
    const store = createSystemLogStore(); store.begin(context("send:a"));
    store.diagnostic({ msg_id: "unrelated", has_error: false }, "ws");
    expect(store.getState().entries.find(row => row.messageId === "unrelated")?.executionId).toBeUndefined();
  });
  it("distinguishes missing values from zero, without a default protocol or recall count", () => {
    const missing = projectDiagnostic({ has_error: false, usage: { total_tokens: null } });
    expect(missing?.usage).toBeUndefined(); expect(missing?.protocol).toBeUndefined(); expect(missing?.recallCount).toBeUndefined();
    expect(projectDiagnostic({ usage: { prompt_tokens: 0 }, recalled_memories: [] })).toMatchObject({ usage: { prompt_tokens: 0 }, recallCount: 0 });
  });
  it("deduplicates failure replay and sorts by its original timestamp", () => {
    const store = createSystemLogStore();
    for (const stamp of [30, 10, 20, 30]) store.diagnostic({ task_id: `task-${stamp}`, created_at: stamp, has_error: true, error_text: "后台任务最终失败", status: "failed" }, "ws");
    expect(store.getState().entries.map(row => row.time)).toEqual([30000, 20000, 10000]);
    expect(store.getState().unread).toBe(true); store.markRead(); expect(store.getState().unread).toBe(false);
    store.clear(); expect(store.getState().entries).toEqual([]);
  });
  it("isolates invalid diagnostic and capture timestamps from the Dialog", () => {
    const store = createSystemLogStore();
    store.diagnostic({ task_id: "bad-time", created_at: 1e30, has_error: true }, "ws");
    expect(Number.isFinite(new Date(store.getState().entries[0].time).getTime())).toBe(true);
    store.snapshots([{ ...snapshot("bad"), created_at: 1e30 }]);
    expect(store.getState().entries.flatMap(row => row.requests)).toHaveLength(0);
  });
  it("marks an error that upgrades a merged record as unread", () => {
    const store = createSystemLogStore(); store.diagnostic({ msg_id: "m", has_error: false }, "ws"); store.markRead();
    store.diagnostic({ msg_id: "m", has_error: true }, "ws"); expect(store.getState().unread).toBe(true);
  });
  it("keeps distinct actual calls under their real origin, bounded by count and total bytes", () => {
    const store = createSystemLogStore();
    store.snapshots(Array.from({ length: 25 }, (_, i) => snapshot(String(i))));
    expect(store.getState().entries[0].requests).toHaveLength(20);
    expect(store.getState().removedRequests).toBe(5);
    store.snapshots([snapshot("26", "send:b", "x".repeat(1024 * 1024))]);
    expect(store.getState().entries.flatMap(row => row.requests).reduce((n, row) => n + row.payloadJson.length * 2, 0)).toBeLessThanOrEqual(REQUEST_MEMORY_BYTES);
    const fresh = createSystemLogStore(); expect(fresh.getState().entries).toEqual([]);
  });
  it("never moves private wire content into ordinary diagnostics or copies raw prompt fields", () => {
    const store = createSystemLogStore();
    store.diagnostic({ msg_id: "m", has_error: true, error_text: "private body [DRIFT:hidden]\n[请求出错: provider_execution_failed]\n上游信息：actual reason", prompt_messages: [{ content: "PRIVATE_PROMPT" }], recalled_memories: [{ content: "[HEART:hidden]", score: .8 }], api_response: { events: [{ data: { message: { content: "PRIVATE_RESPONSE", model: "m" }, authorization: "secret" } }] } }, "ws");
    const text = JSON.stringify(store.getState());
    for (const hidden of ["PRIVATE_PROMPT", "PRIVATE_RESPONSE", "[DRIFT:hidden]", "[HEART:hidden]", "authorization", "private body"]) expect(text).not.toContain(hidden);
    expect(text).toContain("actual reason");
    store.snapshots([snapshot("1", "request:private", '{"messages":[{"content":"PRIVATE_PROMPT [HEART:allowed]"}]}')]);
    expect(store.getState().entries.find(row => row.id === "request:private")?.requests[0].payloadJson).toContain("[HEART:allowed]");
  });
  it("safely tolerates malformed optional diagnostics and preserves actual reasons", () => {
    const store = createSystemLogStore();
    expect(() => store.diagnostic({ msg_id: "m", has_error: true, usage: "bad", recalled_memories: [null, {}, 1], api_response: { events: [null] }, error_text: "[Anthropic API 错误 403] provider_request_failed\n上游信息：region unavailable" }, "ws")).not.toThrow();
    expect(store.getState().entries[0].error).toContain("region unavailable");
    expect(publicText("Authorization: Bearer synthetic-secret")).not.toContain("synthetic-secret");
  });
});
