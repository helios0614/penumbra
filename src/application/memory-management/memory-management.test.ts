import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { createMemoryListController } from "@/application/memory-list";
import { createMemoryManagementController, type MemoryManagementApi } from "./memory-management-controller";
import type { Memory, MemoryDigestResult, MemoryPage, MemoryRequeueTask } from "@/domain/memory";

const memory: Memory = { id: "m", content: "original", createdAt: 1, type: "digest", tags: [], importance: 0.6, isPinned: false, sourceConversationId: null, sourceStartedAt: 1, sourceEndedAt: 10 };
const page = (number = 1, items: readonly Memory[] = [memory], total = 31): MemoryPage => ({ page: number, pageSize: 30, items, total, totalAll: total, hasMore: number * 30 < total });
const task = (patch: Partial<MemoryRequeueTask> = {}): MemoryRequeueTask => ({ id: "t", state: "pending", deletedMemoryId: "m", resultMemoryId: null, sourceCount: 10, lastError: null, deduplicated: false, ...patch });
const receipt = (patch: Partial<MemoryDigestResult> = {}): MemoryDigestResult => ({ ok: true, message: "总结完成", newMemoriesCount: 1, processedMessages: 10, ...patch });
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (v: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
function setup(loader = vi.fn(async (request: { page: number }) => page(request.page))) {
  const pin = vi.fn(async (id: string, unresolved: boolean) => ({ ok: true as const, id, unresolved: unresolved ? 1 as const : 0 as const }));
  const list = createMemoryListController(loader, pin);
  const api = { editMemory: vi.fn(async () => {}), deleteMemory: vi.fn(async () => {}), resummarizeMemory: vi.fn(async () => {}), digestMemories: vi.fn(async () => receipt()), checkMemorySource: vi.fn(async () => ({ supported: true as const, sourceCount: 10 })), deleteAndRequeueMemory: vi.fn(async () => task()), readMemoryTask: vi.fn(async () => task()) };
  const controller = createMemoryManagementController(list, api as MemoryManagementApi);
  return { list, api, controller, loader, pin };
}
afterEach(() => vi.useRealTimers());
describe("Memory management coordination", () => {
  it("cancels editing without a write and refreshes successful edits through the existing loader", async () => {
    const s = setup(); await s.list.load(); s.controller.open({ kind: "edit", memory }); s.controller.close(); expect(s.api.editMemory).not.toHaveBeenCalled();
    s.controller.open({ kind: "edit", memory }); await s.controller.submit({ content: "new" });
    expect(s.api.editMemory).toHaveBeenCalledWith("m", { content: "new" }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(s.loader).toHaveBeenCalledTimes(2); expect(s.controller.getState().action).toBeNull();
  });
  it("retains failed edits, does not replay writes, and reconciles by GET", async () => {
    const s = setup(); await s.list.load(); s.api.editMemory.mockRejectedValueOnce(new ApiError("private", 503));
    s.controller.open({ kind: "edit", memory }); expect(await s.controller.submit({ content: "draft" })).toBe(false);
    expect(s.controller.getState().action?.kind).toBe("edit"); expect(s.controller.getState().actionError?.message).not.toContain("private");
    expect(s.api.editMemory).toHaveBeenCalledOnce(); expect(s.loader).toHaveBeenCalledTimes(2);
  });
  it("ordinary delete calls only DELETE and recovers an empty tail page preserving filters", async () => {
    let removed=false;
    const loader=vi.fn(async (request: {page:number}) => removed ? page(request.page, request.page===2 ? [] : [memory], 30) : page(request.page));
    const s = setup(loader); await s.list.setSearch("needle"); await s.list.setFilters({ date: "7-days", pinFirst: true }); await s.list.setPage(2);
    s.api.deleteMemory.mockImplementation(async () => { removed=true; }); s.controller.open({ kind: "delete", memory }); await s.controller.submit();
    expect(s.api.deleteMemory).toHaveBeenCalledOnce(); expect(s.api.deleteAndRequeueMemory).not.toHaveBeenCalled(); expect(s.api.resummarizeMemory).not.toHaveBeenCalled();
    expect(s.list.getState().data?.page).toBe(1); expect(s.list.getState().request.filters).toMatchObject({ search: "needle", date: "7-days", pinFirst: true });
  });
  it("publishes the server GET result after single resummary, never a receipt projection", async () => {
    let updated=false;
    const s=setup(vi.fn(async r=>page(r.page,[{ ...memory, content: updated ? "server canonical" : "original", importance: updated ? 0.9 : 0.6 }])));
    await s.list.load(); s.api.resummarizeMemory.mockImplementation(async()=>{updated=true;}); s.controller.open({ kind:"resummarize", memory }); await s.controller.submit();
    expect(s.list.getState().data?.items[0]).toMatchObject({content:"server canonical",importance:0.9,id:"m"});
  });
  it("shares per-item exclusion with Pin and blocks duplicate submissions", async () => {
    const s=setup(); await s.list.load(); const hold=deferred<void>(); s.api.resummarizeMemory.mockImplementation(()=>hold.promise);
    s.controller.open({kind:"resummarize",memory}); const first=s.controller.submit(); expect(await s.controller.submit()).toBe(false);
    expect(await s.list.setMemoryUnresolved("m",true)).toBe(false); expect(s.pin).not.toHaveBeenCalled(); expect(s.list.getState().pendingMemoryIds).toContain("m");
    s.controller.close(); expect(s.controller.getState().action).not.toBeNull(); hold.resolve(); await first; expect(s.list.getState().pendingMemoryIds).toEqual([]);
  });
  it("does not infer source availability and blocks confirmation during preflight and conflicts", async () => {
    const s=setup(); const hold=deferred<{supported:true;sourceCount:number}>(); s.api.checkMemorySource.mockImplementation(()=>hold.promise);
    s.controller.open({kind:"requeue",memory}); expect(await s.controller.submit()).toBe(false); hold.resolve({supported:true,sourceCount:10}); await tick();
    s.api.deleteAndRequeueMemory.mockRejectedValueOnce(new ApiError("private",409,{detail:{code:"source_changed"}}));
    expect(await s.controller.submit()).toBe(false); expect(s.controller.getState().sources.m).toMatchObject({status:"ready",value:{supported:false,reason:"source_changed"}});
    expect(await s.controller.submit()).toBe(false); expect(s.api.deleteAndRequeueMemory).toHaveBeenCalledOnce();
  });
  it("keeps legacy time-ranged memories unavailable if the server says untracked", async () => {
    const s=setup(); s.api.checkMemorySource.mockResolvedValue({supported:false,reason:"source_untracked"} as never);
    s.controller.open({kind:"requeue",memory}); await tick(); expect(await s.controller.submit()).toBe(false); expect(s.api.deleteMemory).not.toHaveBeenCalled(); expect(s.api.deleteAndRequeueMemory).not.toHaveBeenCalled();
  });
  it("records queued and failed-pending tasks without any timer, then refreshes completed records", async () => {
    vi.useFakeTimers(); const s=setup(); await s.list.load(); s.controller.open({kind:"requeue",memory}); await tick(); await s.controller.submit(); await tick();
    expect(s.controller.getState().tasks[0].task.state).toBe("pending"); expect(s.api.readMemoryTask).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    s.api.readMemoryTask.mockResolvedValueOnce(task({lastError:"embedding_failure"})); await s.controller.refreshTask("t"); expect(s.controller.getState().tasks[0].task.lastError).toBe("embedding_failure");
    s.api.readMemoryTask.mockResolvedValueOnce(task({state:"completed",resultMemoryId:"new"})); await s.controller.refreshTask("t");
    expect(s.controller.getState().tasks[0].task.state).toBe("completed"); const calls=s.api.readMemoryTask.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3600000); expect(s.api.readMemoryTask).toHaveBeenCalledTimes(calls); expect(s.loader.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
  it.each([receipt(),receipt({newMemoriesCount:0,processedMessages:0,message:"当前没有新增内容需要总结"}),receipt({ok:false,newMemoriesCount:1,message:"部分失败",historyPendingTasks:1})])("retains actual digest counts including empty/partial failure: %j",async result=>{
    const s=setup(); await s.list.setPage(2); s.api.digestMemories.mockResolvedValue(result); await s.controller.digest();
    expect(s.controller.getState().digestResult).toEqual(result); expect(s.list.getState().request.page).toBe(2); expect(s.loader).toHaveBeenCalledTimes(2);
  });
  it("blocks duplicate digest requests and queries known tasks once after either success or failure",async()=>{
    const s=setup(); await s.list.load(); s.controller.open({kind:"requeue",memory}); await tick(); await s.controller.submit(); await tick();
    const hold=deferred<MemoryDigestResult>(); s.api.digestMemories.mockImplementation(()=>hold.promise); const first=s.controller.digest(); await s.controller.digest(); expect(s.api.digestMemories).toHaveBeenCalledOnce();
    hold.reject(new ApiError("private",0,undefined,"TIMEOUT")); await first; expect(s.controller.getState().digestError?.uncertain).toBe(true); expect(s.api.readMemoryTask).toHaveBeenCalledTimes(2);
  });
  it("preserves synchronization errors and retries only GET",async()=>{
    let failed=false; const s=setup(vi.fn(async r=>{if(failed)throw new ApiError("private",503);return page(r.page);})); await s.list.load(); s.controller.open({kind:"edit",memory}); failed=true;
    expect(await s.controller.submit({content:"new"})).toBe(true); expect(s.list.getState().mutationError?.code).toBe("sync"); failed=false; await s.list.load(); expect(s.list.getState().mutationError).toBeNull(); expect(s.api.editMemory).toHaveBeenCalledOnce();
  });
  it("ignores superseded source reads and aborts all reads/writes on disposal",async()=>{
    const s=setup(); const old=deferred<{supported:true;sourceCount:number}>(); s.api.checkMemorySource.mockImplementationOnce(()=>old.promise);
    const first=s.controller.checkSource("m"); const oldOptions=s.api.checkMemorySource.mock.calls[0] as unknown as [string,{signal:AbortSignal}]; await s.controller.checkSource("m");
    old.resolve({supported:true,sourceCount:99}); await first; expect(oldOptions[1].signal.aborted).toBe(true); expect(s.controller.getState().sources.m).toMatchObject({value:{sourceCount:10}});
    const hold=deferred<{supported:true;sourceCount:number}>(); s.api.checkMemorySource.mockImplementationOnce(()=>hold.promise); void s.controller.checkSource("n");
    const options=s.api.checkMemorySource.mock.calls[s.api.checkMemorySource.mock.calls.length - 1] as unknown as [string,{signal:AbortSignal}]; const snapshot=s.controller.getState(); s.controller.dispose(); s.list.dispose(); hold.resolve({supported:true,sourceCount:20}); await tick();
    expect(options[1].signal.aborted).toBe(true); expect(s.controller.getState()).toBe(snapshot);
  });
  it("does not let an older reconciliation replace a newer search result",async()=>{
    const late=deferred<MemoryPage>(); let count=0;
    const loader=vi.fn(async r=>++count===2 ? late.promise : page(r.page,[{...memory,content:count===3?"latest":"old"}]));
    const s=setup(loader); await s.list.load(); s.controller.open({kind:"delete",memory}); const write=s.controller.submit(); await tick(); await s.list.setSearch("new query"); late.resolve(page(1,[{...memory,content:"stale"}])); await write;
    expect(s.list.getState().request.filters.search).toBe("new query"); expect(s.list.getState().data?.items[0].content).toBe("latest");
  });
});

describe("Memory late-result ownership",()=>{
  it("replaces an in-flight task read after digest so stale pending cannot overwrite completed",async()=>{
    const s=setup(); await s.list.load();s.controller.open({kind:"requeue",memory});await tick();await s.controller.submit();await tick();
    const stale=deferred<MemoryRequeueTask>();s.api.readMemoryTask.mockImplementationOnce(()=>stale.promise);
    const old=s.controller.refreshTask("t");
    const oldCall=s.api.readMemoryTask.mock.calls[s.api.readMemoryTask.mock.calls.length-1] as unknown as [string,{signal:AbortSignal}];
    s.api.readMemoryTask.mockResolvedValueOnce(task({state:"completed",resultMemoryId:"new"}));
    await s.controller.digest();expect(oldCall[1].signal.aborted).toBe(true);
    stale.resolve(task());await old;expect(s.controller.getState().tasks[0].task.state).toBe("completed");
  });
  it("aborts pending writes and suppresses late dialog success after unmount",async()=>{
    const s=setup();await s.list.load();const hold=deferred<void>();s.api.editMemory.mockImplementationOnce(()=>hold.promise);
    s.controller.open({kind:"edit",memory});const write=s.controller.submit({content:"draft"});
    const call=s.api.editMemory.mock.calls[0] as unknown as [string,unknown,{signal:AbortSignal}];
    const snapshot=s.controller.getState();s.controller.dispose();s.list.dispose();expect(call[2].signal.aborted).toBe(true);
    hold.resolve();expect(await write).toBe(false);expect(s.controller.getState()).toBe(snapshot);
  });
});

describe("Memory task unmount cleanup",()=>{
  it("aborts a pending task query and never publishes its late completion",async()=>{
    const s=setup();await s.list.load();s.controller.open({kind:"requeue",memory});await tick();await s.controller.submit();await tick();
    const late=deferred<MemoryRequeueTask>();s.api.readMemoryTask.mockImplementationOnce(()=>late.promise);
    const read=s.controller.refreshTask("t");const call=s.api.readMemoryTask.mock.calls[s.api.readMemoryTask.mock.calls.length-1] as unknown as [string,{signal:AbortSignal}];
    const snapshot=s.controller.getState();s.controller.dispose();s.list.dispose();expect(call[1].signal.aborted).toBe(true);
    late.resolve(task({state:"completed",resultMemoryId:"new"}));await read;expect(s.controller.getState()).toBe(snapshot);
  });
  it("blocks a previously available source after an unknown 409 conflict",async()=>{
    const s=setup();s.controller.open({kind:"requeue",memory});await tick();s.api.deleteAndRequeueMemory.mockRejectedValueOnce(new ApiError("private",409,{detail:{code:"future_conflict"}}));
    expect(await s.controller.submit()).toBe(false);expect(s.controller.getState().sources.m.status).toBe("error");
    expect(await s.controller.submit()).toBe(false);expect(s.api.deleteAndRequeueMemory).toHaveBeenCalledOnce();
  });
});

describe("Source preflight across writes", () => {
  it.each(["知远总结","AI总结","新名字总结","旧名字总结"])("rejects source actions for %s locally while retaining edit, Pin and ordinary delete", async type => {
    const special={...memory,type}; const s=setup(vi.fn(async r=>page(r.page,[special]))); await s.list.load();
    for(const kind of ["resummarize","requeue"] as const) {s.controller.open({kind,memory:special}); expect(s.controller.getState().action).toBeNull(); expect(await s.controller.submit()).toBe(false);}
    await s.controller.checkSource("m"); expect(s.api.checkMemorySource).not.toHaveBeenCalled();
    s.controller.open({kind:"edit",memory:special}); expect(await s.controller.submit({content:"edited"})).toBe(true); expect(s.api.editMemory).toHaveBeenCalledOnce();
    expect(await s.list.setMemoryUnresolved("m",true)).toBe(true); expect(s.pin).toHaveBeenCalledOnce();
    s.controller.open({kind:"delete",memory:special}); expect(await s.controller.submit()).toBe(true); expect(s.api.deleteMemory).toHaveBeenCalledOnce();
    expect(s.api.resummarizeMemory).not.toHaveBeenCalled(); expect(s.api.deleteAndRequeueMemory).not.toHaveBeenCalled(); expect(s.api.checkMemorySource).not.toHaveBeenCalled();
  });
  it("drops old source cache and cancels late reads when the server GET now identifies 知远总结", async () => {
    let type="digest"; const s=setup(vi.fn(async r=>page(r.page,[{...memory,type}]))); await s.list.load(); await s.controller.checkSource("m");
    const late=deferred<{supported:true;sourceCount:number}>(); s.api.checkMemorySource.mockImplementationOnce(()=>late.promise); const pending=s.controller.checkSource("m");
    const call=s.api.checkMemorySource.mock.calls[1] as unknown as [string,{signal:AbortSignal}]; type="知远总结"; await s.list.load(); await s.controller.checkSource("m");
    expect(call[1].signal.aborted).toBe(true); late.resolve({supported:true,sourceCount:99}); await pending;
    expect(s.controller.getState().sources.m).toBeUndefined(); await s.controller.digest(); await tick(); expect(s.api.checkMemorySource).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])("rechecks the same source after digest without inventing support (supported=%s)", async supported => {
    const s = setup(); s.api.checkMemorySource.mockResolvedValue((supported ? { supported: true, sourceCount: 10 } : { supported: false, reason: "source_untracked" }) as never);
    await s.controller.checkSource("m"); await s.controller.digest(); await tick();
    expect(s.api.checkMemorySource).toHaveBeenCalledTimes(2);
    expect(s.controller.getState().sources.m).toMatchObject({ status: "ready", value: supported ? { supported: true } : { supported: false, reason: "source_untracked" } });
    expect(s.controller.getState().digestPending).toBe(false); expect(s.list.getState().pendingMemoryIds).toEqual([]);
  });
  it.each(["source_missing", "source_changed", "source_already_represented", "source_requeue_pending", "source_not_historical"])("uses the fresh backend reason %s after digest", async reason => {
    const s = setup(); await s.controller.checkSource("m");
    s.api.checkMemorySource.mockResolvedValueOnce({ supported: false, reason } as never); await s.controller.digest(); await tick();
    expect(s.controller.getState().sources.m).toMatchObject({ status: "ready", value: { supported: false, reason } });
  });
  it.each([false, true])("aborts source reads crossing digest and ignores late results, including digest failure=%s", async failed => {
    const s = setup(); const late = deferred<{ supported: true; sourceCount: number }>();
    s.api.checkMemorySource.mockImplementationOnce(() => late.promise); const read = s.controller.checkSource("m");
    const options = s.api.checkMemorySource.mock.calls[0] as unknown as [string, { signal: AbortSignal }];
    if (failed) s.api.digestMemories.mockRejectedValueOnce(new ApiError("private", 503));
    s.api.checkMemorySource.mockResolvedValueOnce({ supported: false, reason: "source_changed" } as never);
    await s.controller.digest(); await tick(); expect(options[1].signal.aborted).toBe(true);
    late.resolve({ supported: true, sourceCount: 99 }); await read;
    expect(s.controller.getState().sources.m).toMatchObject({ value: { supported: false, reason: "source_changed" } });
    expect(s.controller.getState().digestPending).toBe(false);
  });
  it("invalidates cached capabilities while digest runs and allows a fresh menu preflight after it ends", async () => {
    const s = setup(); await s.controller.checkSource("m"); const held = deferred<MemoryDigestResult>(); s.api.digestMemories.mockImplementationOnce(() => held.promise);
    const write = s.controller.digest(); expect(s.controller.getState().sources.m.status).toBe("loading");
    await s.controller.checkSource("m"); expect(s.api.checkMemorySource).toHaveBeenCalledOnce();
    held.resolve(receipt()); await write; await tick(); expect(s.controller.getState().sources.m).toMatchObject({ value: { supported: true } });
    s.controller.open({ kind: "requeue", memory }); await tick(); expect(s.api.checkMemorySource).toHaveBeenCalledTimes(3);
    expect(s.controller.getState().action?.kind).toBe("requeue");
  });
  it("releases writes without waiting for post-digest task and source reads", async () => {
    const s = setup(); s.controller.open({ kind: "requeue", memory }); await tick(); await s.controller.submit(); await tick();
    await s.controller.checkSource("other"); const heldTask = deferred<MemoryRequeueTask>(); const heldSource = deferred<{ supported: true; sourceCount: number }>();
    s.api.readMemoryTask.mockImplementationOnce(() => heldTask.promise); s.api.checkMemorySource.mockImplementationOnce(() => heldSource.promise);
    await s.controller.digest(); expect(s.controller.getState().digestPending).toBe(false); expect(s.list.getState().pendingMemoryIds).toEqual([]);
    s.controller.open({ kind: "edit", memory: { ...memory, id: "other" } }); expect(s.controller.getState().action?.kind).toBe("edit");
    expect(await s.controller.submit({ content: "new" })).toBe(true);
    heldTask.resolve(task()); heldSource.resolve({ supported: true, sourceCount: 99 }); await tick();
    expect(s.controller.getState().sources.other).toMatchObject({ value: { sourceCount: 10 } });
  });
  it.each(["source_untracked", "source_missing", "source_changed", "source_already_represented", "source_requeue_pending"])("preserves authoritative combined conflict %s until an explicit preflight", async code => {
    const s = setup(); s.controller.open({ kind: "requeue", memory }); await tick();
    s.api.deleteAndRequeueMemory.mockRejectedValueOnce(new ApiError("private", 409, { detail: { code } }));
    expect(await s.controller.submit()).toBe(false); expect(s.controller.getState().sources.m).toMatchObject({ value: { supported: false, reason: code } });
    expect(s.controller.getState().tasks).toEqual([]); expect(s.list.getState().data?.items[0].id).toBe("m"); expect(s.api.deleteMemory).not.toHaveBeenCalled();
    await s.controller.checkSource("m"); expect(s.controller.getState().sources.m).toMatchObject({ value: { supported: true } });
  });
  it("keeps an uncertain combination retryable for same-ID receipt recovery, reconciling only by GET", async () => {
    const s = setup(); s.controller.open({ kind: "requeue", memory }); await tick();
    s.api.deleteAndRequeueMemory.mockRejectedValueOnce(new ApiError("private", 0, undefined, "TIMEOUT"));
    expect(await s.controller.submit()).toBe(false); expect(s.controller.getState().actionError?.uncertain).toBe(true); expect(s.controller.getState().tasks).toEqual([]);
    expect(s.controller.getState().sources.m).toMatchObject({ value: { supported: true } });
    expect(await s.controller.submit()).toBe(true); await tick(); expect(s.controller.getState().sources.m).toBeUndefined();
    expect(s.controller.getState().tasks[0].task.id).toBe("t"); expect(s.api.deleteMemory).not.toHaveBeenCalled();
  });
  it("rechecks provenance after single resummary and drops a successfully deleted row's capability", async () => {
    const s = setup(); await s.controller.checkSource("m"); s.controller.open({ kind: "resummarize", memory }); await s.controller.submit(); await tick();
    expect(s.api.checkMemorySource).toHaveBeenCalledTimes(2);
    s.controller.open({ kind: "delete", memory }); await s.controller.submit(); expect(s.controller.getState().sources.m).toBeUndefined(); expect(s.api.checkMemorySource).toHaveBeenCalledTimes(2);
  });
});
