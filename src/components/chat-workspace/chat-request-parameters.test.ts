import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatSettingsController } from "./chat-settings-controller";
import type { ChatSettingsScope } from "./chat-request-parameters";
import { getChatDefaults, mapChatDefaults, patchChatDefault, type ChatDefaults, type ChatDefaultsRead } from "@/domain/runtime/chat-defaults";
import { ApiError } from "@/lib/api";

const scope = (id = "a", protocol = "openai_chat_completions"): ChatSettingsScope => ({ conversationId: id, selection: { connectionId: "c", protocol, model: "literal" } });
function projection(revision = 0): ChatDefaults {
  return { revision, protocol: "openai_chat_completions", context_limit: { value: 30, source: "backend_default", defaultValue: 30, min: 1, max: 100 },
    temperature: { value: 1, source: "backend_default", defaultValue: 1, min: 0, max: 2 } };
}
function fixture() {
  let server = projection(), selected = scope(), editable = true;
  const load = vi.fn(async (): Promise<ChatDefaultsRead> => ({ ...server, conversationId: selected.conversationId, selection: selected.selection }));
  const save = vi.fn<typeof patchChatDefault>(async (field, value, protocol, revision): Promise<ChatDefaults> => {
    expect(revision).toBe(server.revision);
    server = { ...server, protocol, revision: revision + 1, [field]: { ...server[field as "context_limit"], value: value ?? 30, source: value === null ? "backend_default" : "saved" } };
    return server;
  });
  const controller = createChatSettingsController({ load, save, canEdit: () => editable });
  controller.select(selected);
  return { controller, load, save, state: controller.getState, server: () => server,
    lock: () => { editable = false; }, select: (next: ChatSettingsScope) => { selected = next; controller.select(next); },
    patchServer: (value: ChatDefaults) => { server = value; } };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
afterEach(() => vi.unstubAllGlobals());

describe("server-backed Chat settings owner", () => {
  it("reads effective defaults, previews without a write, commits one field and restores by null", async () => {
    const s = fixture(); expect(s.state().data).toBeNull(); await s.controller.open(); const lease = s.state().scope!;
    expect(s.state().data?.context_limit.value).toBe(30);
    for (let n = 1; n <= 100; n++) s.controller.preview(lease, "context_limit", n);
    expect(s.save).not.toHaveBeenCalled(); s.controller.commit(lease, "context_limit"); await flush();
    expect(s.save).toHaveBeenCalledOnce(); expect(s.save).toHaveBeenCalledWith("context_limit", 100, "openai_chat_completions", 0);
    expect(s.state().drafts).toEqual({}); expect(s.state().data?.context_limit.source).toBe("saved");
    s.controller.commit(lease, "context_limit", null); await flush(); expect(s.state().data?.context_limit.source).toBe("backend_default");
  });
  it("retains zero, enforces metadata bounds and never sends unchanged/invalid edits", async () => {
    const s = fixture(); await s.controller.open(); const lease = s.state().scope!;
    for (const value of [0, -1, 1.5, 101, NaN, Infinity]) s.controller.preview(lease, "context_limit", value);
    expect(s.state().drafts).toEqual({});
    s.controller.preview(lease, "temperature", 1); s.controller.commit(lease, "temperature"); expect(s.save).not.toHaveBeenCalled();
    s.controller.preview(lease, "temperature", 0); s.controller.commit(lease, "temperature"); await flush();
    expect(s.save).toHaveBeenCalledWith("temperature", 0, "openai_chat_completions", 0);
    s.patchServer({ ...s.server(), protocol: "anthropic_messages", temperature: { ...s.server().temperature!, max: 1 } });
    s.select(scope("a", "anthropic_messages")); await s.controller.open();
    s.controller.preview(s.state().scope!, "temperature", 1.1); expect(s.state().drafts).toEqual({});
  });
  it("serializes rapid commits and prevents old responses from overwriting newer display or revisions", async () => {
    const s = fixture(); await s.controller.open(); const lease = s.state().scope!, pending = deferred<ChatDefaults>();
    s.save.mockImplementationOnce(() => pending.promise);
    s.controller.preview(lease, "context_limit", 40); s.controller.commit(lease, "context_limit");
    s.controller.commit(lease, "context_limit", 40); // Duplicate end event must not create a second write.
    s.controller.preview(lease, "context_limit", 50); s.controller.commit(lease, "context_limit");
    s.controller.preview(lease, "context_limit", 60); s.controller.commit(lease, "context_limit");
    expect(s.save).toHaveBeenCalledOnce(); expect(s.state().drafts.context_limit).toBe(60);
    const response = { ...projection(1), context_limit: { ...projection().context_limit, value: 40, source: "saved" as const } };
    s.patchServer(response); pending.resolve(response); await flush();
    expect(s.save).toHaveBeenCalledTimes(2); expect(s.save.mock.calls[1]).toEqual(["context_limit", 60, "openai_chat_completions", 1]);
    expect(s.state().data?.context_limit.value).toBe(60); expect(s.state().drafts).toEqual({});
  });
  it("preserves retryable edits on failure, reconciles with GET and never auto-repeats PATCH", async () => {
    const s = fixture(); await s.controller.open(); const lease = s.state().scope!;
    s.save.mockRejectedValueOnce(new ApiError("private", 409));
    s.controller.commit(lease, "context_limit", 70); await flush();
    expect(s.save).toHaveBeenCalledOnce(); expect(s.load).toHaveBeenCalledTimes(2);
    expect(s.state().drafts.context_limit).toBe(70); expect(s.state().errors.context_limit).toContain("重试");
    expect(s.state().data?.context_limit.value).toBe(30);
    s.controller.commit(lease, "context_limit"); await flush(); expect(s.state().data?.context_limit.value).toBe(70);
    expect(s.state().errors).toEqual({});
  });
  it("rejects a refresh started before a save and an older revision received after it", async () => {
    const s = fixture(); await s.controller.open(); const lease = s.state().scope!;
    const stale = { ...projection(), conversationId: lease.conversationId, selection: lease.selection };
    const pending = deferred<ChatDefaultsRead>(); s.load.mockImplementationOnce(() => pending.promise);
    const reading = s.controller.open(); s.controller.commit(lease, "context_limit", 65); await flush();
    pending.resolve(stale); await reading;
    expect(s.state().data?.context_limit.value).toBe(65); expect(s.state().data?.revision).toBe(1);
    s.load.mockResolvedValueOnce(stale); await s.controller.open();
    expect(s.state().data?.context_limit.value).toBe(65); expect(s.state().data?.revision).toBe(1);
  });
  it.each([70, 75])("does not strand a new explicit edit %s received during failure reconciliation", async value => {
    const s = fixture(); await s.controller.open(); const lease = s.state().scope!;
    const pending = deferred<ChatDefaultsRead>(); s.load.mockImplementationOnce(() => pending.promise);
    s.save.mockRejectedValueOnce(new Error("disk"));
    s.controller.commit(lease, "context_limit", 70); await flush();
    s.controller.commit(lease, "context_limit", value);
    pending.resolve({ ...projection(), conversationId: lease.conversationId, selection: lease.selection }); await flush();
    expect(s.save).toHaveBeenCalledTimes(2); expect(s.state().data?.context_limit.value).toBe(value);
    expect(s.state().drafts).toEqual({}); expect(s.state().errors).toEqual({});
  });
  it("rejects stale A→B→A forms, late reads, execution locks and disposed callbacks", async () => {
    const s = fixture(), pending = deferred<ChatDefaultsRead>(); s.load.mockImplementationOnce(() => pending.promise);
    const reading = s.controller.open(), old = s.state().scope!; s.select(scope("b")); await s.controller.open();
    pending.resolve({ ...projection(), conversationId: "a", selection: old.selection }); await reading;
    expect(s.state().scope?.conversationId).toBe("b"); s.controller.commit(old, "context_limit", 99); expect(s.save).not.toHaveBeenCalled();
    s.select(scope("a")); await s.controller.open(); s.controller.commit(old, "context_limit", 98); expect(s.save).not.toHaveBeenCalled();
    s.lock(); s.controller.commit(s.state().scope!, "context_limit", 97); expect(s.save).not.toHaveBeenCalled();
    s.controller.dispose(); s.controller.commit(s.state().scope!, "context_limit", 96); expect(s.save).not.toHaveBeenCalled();
  });
  it("uses persisted values after reopening and a fresh controller, without injecting them into send input", async () => {
    const s = fixture(); await s.controller.open(); s.controller.commit(s.state().scope!, "context_limit", 80); await flush();
    s.select(scope("b")); await s.controller.open(); expect(s.state().data?.context_limit.value).toBe(80);
    const fresh = createChatSettingsController({ load: s.load, save: s.save, canEdit: () => true }); fresh.select(scope("b")); await fresh.open();
    expect(fresh.getState().data?.context_limit.value).toBe(80);
  });
});

describe("safe Chat defaults DTO/client", () => {
  const wire = { revision: 0, protocol: "openai_chat_completions", context_limit: { value: 30, source: "backend_default", default_value: 30, min: 1, max: 100 },
    temperature: { value: 0, source: "saved", default_value: 1, min: 0, max: 2 } };
  it("maps effective/source metadata and rejects invalid values", () => {
    expect(mapChatDefaults(wire).temperature?.value).toBe(0);
    expect(() => mapChatDefaults({ ...wire, revision: -1 })).toThrow();
    expect(() => mapChatDefaults({ ...wire, context_limit: { ...wire.context_limit, value: 1.5 } })).toThrow();
    expect(() => mapChatDefaults({ ...wire, temperature: { ...wire.temperature, value: Infinity } })).toThrow();
  });
  it("uses authenticated no-store GET and single-field revision PATCH only", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ ...wire, conversation_id: "a", selection: { connection_id: "c", protocol: wire.protocol, model: "literal" } }), { headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", fetch);
    await getChatDefaults("a"); await patchChatDefault("temperature", 0, wire.protocol, 0);
    expect(String(fetch.mock.calls[0]?.[0])).toBe("/api/main/chat-defaults?conv_id=a");
    const init = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(init.credentials).toBe("include"); expect(JSON.parse(String(init.body))).toEqual({ field: "temperature", value: 0, protocol: wire.protocol, expected_revision: 0 });
  });
});
