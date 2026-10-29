import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { buildMemoryEditDto, checkMemorySource, deleteAndRequeueMemory, deleteMemory, digestMemories, editMemory, mapMemoryDigest, mapMemoryList, mapMemoryResummary, mapMemorySource, mapMemoryTask, MemoryBusinessError, MemoryContractError, readMemoryTask, resummarizeMemory } from "./index";

const task = (patch = {}) => ({ ok: true, task_id: "task/a", state: "pending", deleted_memory_id: "mem/a", result_memory_id: null, source_count: 10, last_error: null, deduplicated: false, ...patch });
afterEach(() => vi.unstubAllGlobals());
describe("memory management contracts", () => {
  it("edits only explicitly requested fields without replacing unrelated metadata", () => {
    expect(buildMemoryEditDto({ content: " \n原文\n " })).toEqual({ content: " \n原文\n " });
    expect(buildMemoryEditDto({ content: "新文字", keywords: "[]", importance: 0 })).toEqual({ content: "新文字", keywords: "[]", importance: 0 });
    for (const input of [{ content: " " }, { content: "ok", importance: NaN }, { content: "ok", importance: 2 }]) expect(() => buildMemoryEditDto(input)).toThrow(MemoryContractError);
  });
  it("preserves full wire keywords while keeping the existing reading projection", () => {
    const keywords = JSON.stringify(Array.from({ length: 40 }, (_, i) => `tag-${i}`));
    const page = mapMemoryList({ page: 1, page_size: 30, total: 1, total_all: 1, has_more: false, items: [{ id: "a", content: "full", created_at: 1, keywords }] });
    expect(page.items[0].tags).toHaveLength(32);
    expect(page.items[0].keywordsForEdit).toBe(keywords);
  });
  it("maps supported and unsupported sources without inferring from timestamps", () => {
    expect(mapMemorySource({ supported: true, source_count: 10 })).toEqual({ supported: true, sourceCount: 10 });
    expect(mapMemorySource({ supported: false, reason: "source_untracked" })).toEqual({ supported: false, reason: "source_untracked" });
    expect(() => mapMemorySource({ source_start_ts: 1, source_end_ts: 10 })).toThrow(MemoryContractError);
  });
  it("treats resummary HTTP business failures as failures and validates the target", () => {
    expect(() => mapMemoryResummary({ ok: false, message: "模型返回为空，请检查 API 配置" }, "a")).toThrow(MemoryBusinessError);
    expect(() => mapMemoryResummary({ ok: true, id: "other" }, "a")).toThrow(MemoryContractError);
    expect(() => mapMemoryResummary({ ok: true, id: "a", content: "new", keywords: "[]", importance: 0.9, unresolved: 1 }, "a")).not.toThrow();
  });
  it("keeps empty and partial-failure digest receipts as real results", () => {
    expect(mapMemoryDigest({ ok: true, message: "当前没有新增内容需要总结", new_memories_count: 0, processed_messages: 0 }).newMemoriesCount).toBe(0);
    expect(mapMemoryDigest({ ok: false, message: "历史材料总结失败，待处理任务已保留", new_memories_count: 1, processed_messages: 10, history_completed_tasks: 1, history_pending_tasks: 2, outcome: "requeue_llm_failure" })).toMatchObject({ ok: false, newMemoriesCount: 1, historyPendingTasks: 2 });
    expect(() => mapMemoryDigest({ ok: true, message: "done", new_memories_count: -1, processed_messages: 0 })).toThrow(MemoryContractError);
  });
  it("accepts pending with last_error and completed receipts, rejecting invented running states", () => {
    expect(mapMemoryTask(task({ last_error: "source_changed" }))).toMatchObject({ state: "pending", lastError: "source_changed" });
    expect(mapMemoryTask(task({ state: "completed", result_memory_id: "new", deduplicated: true }))).toMatchObject({ state: "completed", resultMemoryId: "new" });
    for (const payload of [task({ state: "running" }), task({ state: "completed" }), task({ source_count: 0 }), task({ task_id: "other" })]) expect(() => mapMemoryTask(payload, { taskId: "task/a" })).toThrow(MemoryContractError);
    expect(() => mapMemoryTask(task(), { memoryId: "other" })).toThrow(MemoryContractError);
  });
});
describe("memory management typed requests", () => {
  it("uses all seven verified paths and only the actual edit body", async () => {
    const replies = [{ ok: true, id: "mem/a" }, { ok: true }, { ok: true, id: "mem/a", content: "new", keywords: "[]", importance: 0.5, unresolved: 0 }, { ok: true, message: "empty", new_memories_count: 0, processed_messages: 0 }, { supported: true, source_count: 10 }, task(), task()];
    const fetch = vi.fn(async () => new Response(JSON.stringify(replies.shift()), { headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", fetch);
    await editMemory("mem/a", { content: "new", importance: 0.7 }); await deleteMemory("mem/a"); await resummarizeMemory("mem/a"); await digestMemories(); await checkMemorySource("mem/a"); await deleteAndRequeueMemory("mem/a"); await readMemoryTask("task/a");
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => [new URL(url, "https://fixture.test").pathname, init.method])).toEqual([
      ["/api/memories/mem%2Fa", "PUT"], ["/api/memories/mem%2Fa", "DELETE"], ["/api/memories/mem%2Fa/re_summarize", "POST"], ["/api/memories/digest", "POST"], ["/api/memories/mem%2Fa/requeue-source", "GET"], ["/api/memories/mem%2Fa/delete-and-requeue", "POST"], ["/api/memories/requeue/tasks/task%2Fa", "GET"],
    ]);
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ content: "new", importance: 0.7 });
    for (const [, init] of calls.slice(1)) { expect(init.body).toBeUndefined(); expect(init.credentials).toBe("include"); }
  });
  it("preserves authenticated transport errors and rejects malformed successful receipts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: { code: "source_changed" } }), { status: 409 })));
    await expect(deleteAndRequeueMemory("a")).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, id: "wrong" }))));
    await expect(editMemory("a", { content: "new" })).rejects.toBeInstanceOf(MemoryContractError);
  });
});
