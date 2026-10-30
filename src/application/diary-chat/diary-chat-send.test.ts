import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { createDiaryChatController } from "./diary-chat-controller";
import { presentDiaryTimeline } from "@/components/diary/diary-chat-presenter";
import type { DiarySendEvent } from "@/domain/diary/diary-chat-send-client";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";

const row = (id: string, role = "assistant", content = "相同正文", entryId = "a"): DiaryMessage => ({ id, entryId, role, content, createdAt: 1, updatedAt: null, thinking: null, drift: null });
const start: DiarySendEvent = { type: "start", entryId: "a", userId: "user-real", assistantId: "ai-real" };
const done = (message: DiaryMessage | null = row("ai-real")): DiarySendEvent => ({ type: "done", message, drift: "d", thinking: "t" });
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function channel() {
  const queue: IteratorResult<DiarySendEvent>[] = [];
  let wake: ((value: IteratorResult<DiarySendEvent>) => void) | undefined;
  const push = (value: IteratorResult<DiarySendEvent>) => { if (wake) { const next = wake; wake = undefined; next(value); } else queue.push(value); };
  return { push: (value: DiarySendEvent) => push({ done: false, value }), end: () => push({ done: true, value: undefined }),
    async *read() { while (true) { const next = queue.shift() ?? await new Promise<IteratorResult<DiarySendEvent>>(resolve => { wake = resolve; }); if (next.done) return; yield next.value; } } };
}
async function setup() {
  const wire = channel();
  const deps = { getEntry: vi.fn(async (id: string) => ({ id, date: "2020-01-02", title: null, status: "writing" })),
    getMessages: vi.fn(async (_id: string): Promise<readonly DiaryMessage[]> => []),
    sendMessage: vi.fn((_id: string, _content: string, _signal: AbortSignal) => wire.read()) };
  const c = createDiaryChatController(deps); await c.open("a");
  const visible = () => { const s = c.getState(); return presentDiaryTimeline(s.entryId!, s.messages, s.overlays); };
  return { c, deps, wire, visible };
}
afterEach(() => vi.useRealTimers());

describe("Diary same-Entry send and persistence reconciliation", () => {
  it("binds saved user/reserved assistant IDs, grows a bubble, and keeps identical prose under distinct IDs", async () => {
    const { c, deps, wire, visible } = await setup();
    const task = c.send("相同正文"); expect(visible()).toHaveLength(2); expect(c.getState().sending).toBe(true);
    expect(await c.send("重复点击")).toBe(false);
    wire.push(start); wire.push({ type: "chunk", content: "第一" }); await settle();
    expect(visible().map(m => m.id)).toEqual(["user-real", "ai-real"]); expect(visible()[1].content).toBe("第一");
    wire.push({ type: "chunk", content: "第二" }); await settle(); expect(visible()[1].content).toBe("第一第二");
    const saved = row("ai-real", "assistant", "最终正文");
    deps.getMessages.mockResolvedValue([row("same-but-other", "user"), row("user-real", "user"), saved]);
    wire.push(done(saved)); wire.end(); expect(await task).toBe(true); await settle();
    expect(visible().map(m => [m.id, m.content])).toEqual([["same-but-other", "相同正文"], ["user-real", "相同正文"], ["ai-real", "最终正文"]]);
    expect(c.getState()).toMatchObject({ sending: false, overlays: [] });
    expect(deps.sendMessage.mock.calls[0].slice(0, 2)).toEqual(["a", "相同正文"]);
    const again = c.send("自动投喂后的继续回答"); wire.push(start); wire.push(done(null)); wire.end(); await again; expect(deps.sendMessage.mock.calls[1][0]).toBe("a"); c.dispose();
  });
  it("WS-before-done invalidates history; canonical saved content suppresses subsequent raw chunks", async () => {
    vi.useFakeTimers(); const { c, deps, wire, visible } = await setup(); const task = c.send("hello");
    wire.push(start); wire.push({ type: "chunk", content: "raw" }); await settle();
    deps.getMessages.mockResolvedValue([row("user-real", "user"), row("ai-real", "assistant", "clean")]);
    c.handleEvent({ type: "diary-message-created", entryId: "a", messageId: "ai-real" });
    await vi.advanceTimersByTimeAsync(200); expect(visible().map(m => m.content)).toEqual(["相同正文", "clean"]);
    wire.push({ type: "chunk", content: "must not overwrite" }); await settle(); expect(visible()[1].content).toBe("clean");
    wire.push(done(row("ai-real", "assistant", "clean"))); wire.end(); await task; await settle();
    expect(visible().map(m => m.id)).toEqual(["user-real", "ai-real"]); c.dispose();
  });
  it("done-before-WS retains its receipt across failed GET, unlocks Sender, then converges to HTTP array order", async () => {
    vi.useFakeTimers(); const { c, deps, wire, visible } = await setup(); const task = c.send("hello");
    deps.getMessages.mockRejectedValueOnce(new Error("offline"));
    wire.push(start); wire.push(done(row("ai-real", "assistant", "saved"))); wire.end(); await task; await settle();
    expect(c.getState()).toMatchObject({ sending: false, error: { source: "history" } }); expect(visible()[1].content).toBe("saved");
    deps.getMessages.mockResolvedValue([row("ai-real", "assistant", "saved"), row("unrelated"), row("user-real", "user")]);
    c.handleEvent({ type: "diary-message-created", entryId: "a", messageId: "ai-real" }); await vi.advanceTimersByTimeAsync(200);
    expect(visible().map(m => m.id)).toEqual(["ai-real", "unrelated", "user-real"]); expect(c.getState().overlays).toEqual([]); c.dispose();
  });
  it("error followed by partial persistence preserves both the saved messages and failure feedback", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.send("saved user");
    deps.getMessages.mockRejectedValueOnce(new Error("offline"));
    wire.push(start); wire.push({ type: "chunk", content: "partial" }); wire.push({ type: "error" }); wire.push(done(row("ai-real", "assistant", "partial"))); wire.end();
    expect(await task).toBe(false); await settle(); expect(c.getState().sendError).toContain("错误");
    expect(visible().map(m => m.id)).toEqual(["user-real", "ai-real"]); expect(c.getState().sending).toBe(false); c.dispose();
  });
  it("start then EOF keeps acknowledged user and unconfirmed assistant without automatic resend", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.send("hello"); deps.getMessages.mockRejectedValueOnce(new Error("offline"));
    wire.push(start); wire.push({ type: "chunk", content: "partial" }); wire.end(); expect(await task).toBe(false); await settle();
    expect(visible().map(m => [m.id, m.executionStatus])).toEqual([["user-real", undefined], ["ai-real", "unconfirmed"]]);
    expect(c.getState().sendError).toContain("不要直接重发"); expect(deps.sendMessage).toHaveBeenCalledOnce(); c.dispose();
  });
  it("done.message=null removes only the unsaved placeholder, retaining blank persisted messages", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.send("hello");
    deps.getMessages.mockResolvedValue([row("user-real", "user"), row("blank", "assistant", "")]);
    wire.push(start); wire.push({ type: "chunk", content: "not saved" }); wire.push(done(null)); wire.end(); await task; await settle();
    expect(visible().map(m => m.id)).toEqual(["user-real", "blank"]); c.dispose();
  });
  it("unknown identity is never guessed from equal text even after a successful history read", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.send("相同正文");
    deps.getMessages.mockResolvedValue([row("some-user", "user"), row("some-ai")]); wire.push({ type: "chunk", content: "相同正文" }); wire.end();
    expect(await task).toBe(false); await settle(); expect(visible()).toHaveLength(4);
    expect(c.getState().overlays.every(m => m.status === "unconfirmed")).toBe(true); c.dispose();
  });
  it("a pre-send history response cannot remove the new overlay and final GET can remain pending without locking sends", async () => {
    const { c, deps, wire, visible } = await setup(); const stale = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(stale.promise);
    const refresh = c.refresh(); await settle(); const final = deferred<readonly DiaryMessage[]>(); deps.getMessages.mockReturnValueOnce(final.promise);
    const task = c.send("hello"); wire.push(start); wire.push({ type: "chunk", content: "growing" }); await settle();
    stale.resolve([row("stale")]); await refresh; expect(visible().map(m => m.id)).toEqual(["user-real", "ai-real"]);
    wire.push(done()); wire.end(); await task; expect(c.getState().sending).toBe(false);
    final.resolve([row("user-real", "user"), row("ai-real")]); await settle(); c.dispose();
  });
  it("a refresh during streaming merges by ID without removing unmatched overlay", async () => {
    const { c, deps, wire, visible } = await setup(); const task = c.send("hello"); wire.push(start); await settle();
    deps.getMessages.mockResolvedValue([row("background"), row("user-real", "user")]); await c.refresh();
    wire.push({ type: "chunk", content: "still growing" }); await settle();
    expect(visible().map(m => m.id)).toEqual(["background", "user-real", "ai-real"]); expect(visible()[2].content).toBe("still growing");
    wire.push(done()); wire.end(); await task; await settle(); c.dispose();
  });
  it("publishes a history/overlay reconciliation atomically so subscribers never lose acknowledged messages", async () => {
    const { c, deps, wire } = await setup(); const task = c.send("hello"); wire.push(start); await settle();
    const seen: string[][] = [];
    const unsubscribe = c.subscribe(s => seen.push(presentDiaryTimeline("a", s.messages, s.overlays).map(m => m.id)));
    deps.getMessages.mockResolvedValue([row("user-real", "user"), row("ai-real")]); await c.refresh();
    expect(seen.every(ids => ids.includes("user-real"))).toBe(true);
    unsubscribe(); wire.push(done()); wire.end(); await task; await settle(); c.dispose();
  });
  it("switching Entry or deletion isolates late SSE, reads, and final refresh", async () => {
    const { c, deps, wire } = await setup(); const task = c.send("old"); wire.push(start); await settle();
    await c.open("b"); expect(deps.sendMessage.mock.calls[0][2].aborted).toBe(true);
    wire.push(done()); wire.end(); expect(await task).toBe(false); await settle();
    expect(c.getState()).toMatchObject({ entryId: "b", messages: [], overlays: [], sending: false });
    expect(deps.getMessages.mock.calls.map(c => c[0])).toEqual(["a", "b"]); c.dispose();
  });
  it("shows Thinking and DRIFT separately while streaming, suppressing partial display markers", async () => {
    const { c, wire, visible } = await setup(); const task = c.send("hello"); wire.push(start);
    wire.push({ type: "chunk", content: "[THINKING_STA" }); await settle(); expect(visible()[1].content).toBe("");
    wire.push({ type: "chunk", content: "RT]思考[THINKING_END][DRIFT:记录]正文[NextGroup]" }); await settle();
    expect(visible()[1]).toMatchObject({ content: "正文", thinking: "思考", simpleThink: "记录" });
    wire.push(done(null)); wire.end(); await task; c.dispose();
  });
});


it("shows a known API-address preflight error for send without keeping unsaved local placeholders", async () => {
  const { c, deps, visible } = await setup();
  deps.sendMessage.mockImplementationOnce(async function* () { throw new ApiError("private", 422, { detail: { code: "missing_base_url" } }); });
  expect(await c.send("draft")).toBe(false); await settle();
  expect(visible()).toEqual([]); expect(c.getState().sendError).toBe("当前模型配置缺少 API 地址，请检查模型设置。"); c.dispose();
});
