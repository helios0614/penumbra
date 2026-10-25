import { describe, expect, it, vi } from "vitest";
import { createAttachmentDraftStore } from "./attachment-drafts";
const file = (name = "photo.png", type = "image/png") => ({ name, type, size: 100 } as File);
const result = (url = "/uploads/1700000000000.png") => ({ url, name: "photo.png", type: "image/png" as const });
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup() {
  let n = 0;
  const calls: ReturnType<typeof deferred<ReturnType<typeof result>>>[] = [];
  const upload = vi.fn(() => { const call = deferred<ReturnType<typeof result>>(); calls.push(call); return call.promise; });
  const revoke = vi.fn();
  const store = createAttachmentDraftStore({ upload, createUrl: f => `blob:${f.name}`, revokeUrl: revoke, id: () => String(++n) });
  return { store, upload, revoke, calls };
}
describe("page-owned attachment drafts", () => {
  it("uses local draft identity without depending on secure execution UUID support", () => {
    const store = createAttachmentDraftStore({ createUrl: () => "blob:local", revokeUrl: vi.fn(), upload: vi.fn(() => new Promise<ReturnType<typeof result>>(() => {})) });
    store.add("A", [file(), file("b.png")]);
    expect(store.get("A").map(item => item.id)).toEqual(["draft:1", "draft:2"]); store.dispose();
  });
  it("previews immediately and late A uploads cannot enter B", async () => {
    const s = setup(); s.store.add("A", [file()]); s.store.add("B", [file("b.png")]);
    expect(s.store.get("A")[0]).toMatchObject({ owner: "A", status: "uploading", previewUrl: "blob:photo.png" });
    expect(s.store.capture("A")).toBeNull();
    s.calls[0].resolve(result()); await Promise.resolve();
    expect(s.store.get("A")[0].status).toBe("uploaded"); expect(s.store.get("B")[0].status).toBe("uploading");
    s.store.dispose();
  });
  it("ignores removed/aborted uploads even when the transport ignores abort", async () => {
    const s = setup(); s.store.add("A", [file()]); const id = s.store.get("A")[0].id;
    s.store.remove("A", id); s.calls[0].resolve(result()); await Promise.resolve();
    expect(s.store.get("A")).toEqual([]); expect(s.revoke).toHaveBeenCalledOnce();
  });
  it("accepts only the exact snapshot; later attachments survive and preview leases delay revoke", async () => {
    const s = setup(); s.store.add("A", [file()]); s.calls[0].resolve(result()); await Promise.resolve();
    const holdViewer = s.store.retain(["1"]), snap = s.store.capture("A")!;
    expect(s.store.get("A")).toEqual([]); expect(snap.urls).toEqual([result().url]); expect(s.revoke).not.toHaveBeenCalled();
    s.store.add("A", [file("new.png")]); snap.accept(); snap.release();
    expect(s.store.get("A").map(item => item.id)).toEqual(["2"]); expect(s.revoke).not.toHaveBeenCalled();
    holdViewer(); holdViewer(); expect(s.revoke).toHaveBeenCalledOnce(); s.store.dispose();
  });
  it("keeps a rejected/unknown submission separate, restoring text and uploaded URLs only explicitly", async () => {
    const s = setup(); s.store.add("A", [file()]); s.calls[0].resolve(result()); await Promise.resolve();
    const snap = s.store.capture("A")!;
    s.store.add("A", [file("next.png")]);
    snap.preserve("原始提交"); snap.preserve("重复回调"); snap.release(); snap.release();
    expect(s.store.get("A").map(item => item.file.name)).toEqual(["next.png"]);
    const recovery = s.store.getRecoveries("A")[0];
    expect(s.store.getRecoveries("B")).toEqual([]); expect(recovery.content).toBe("原始提交");
    expect(s.revoke).not.toHaveBeenCalled(); expect(s.upload).toHaveBeenCalledTimes(2);
    expect(s.store.restoreRecovery("B", recovery.id)).toBeNull();
    expect(s.store.restoreRecovery("A", recovery.id)).toBe("原始提交");
    expect(s.store.get("A").map(item => item.file.name)).toEqual(["photo.png", "next.png"]);
    expect(s.store.get("A")[0].uploaded?.url).toBe(result().url);
    expect(s.store.restoreRecovery("A", recovery.id)).toBeNull(); s.store.dispose(); expect(s.revoke).toHaveBeenCalledTimes(2);
  });
  it("does not resurrect deleted owners or disposed snapshots after a late callback", async () => {
    const s = setup(); s.store.add("A", [file()]); s.calls[0].resolve(result()); await Promise.resolve();
    const snap = s.store.capture("A")!; s.store.delete("A");
    s.store.add("A", [file("new-owner.png")]); snap.preserve("late"); snap.release();
    expect(s.store.get("A").map(item => item.file.name)).toEqual(["new-owner.png"]); expect(s.store.getRecoveries("A")).toEqual([]);
    s.calls[1].resolve(result()); await Promise.resolve(); const later = s.store.capture("A")!;
    s.store.dispose(); s.store.activate(); later.release(); expect(s.store.get("A")).toEqual([]); expect(s.revoke).toHaveBeenCalledTimes(2);
  });
  it("explicitly discards frozen submissions while an open preview keeps its own lease", async () => {
    const s = setup(); s.store.add("A", [file()]); s.calls[0].resolve(result()); await Promise.resolve();
    const viewer = s.store.retain(["1"]), snap = s.store.capture("A")!;
    snap.preserve(""); snap.release(); s.store.discardRecovery("A", s.store.getRecoveries("A")[0].id);
    expect(s.store.getRecoveries("A")).toEqual([]); expect(s.revoke).not.toHaveBeenCalled();
    viewer(); expect(s.revoke).toHaveBeenCalledOnce(); s.store.dispose();
  });
  it("failed send releases its snapshot without retrying upload, keeping the existing URL", async () => {
    const s = setup(); s.store.add("A", [file()]); s.calls[0].resolve(result()); await Promise.resolve();
    s.store.capture("A")!.release();
    const second = s.store.capture("A")!; expect(second.urls).toEqual([result().url]); second.release(); expect(s.upload).toHaveBeenCalledOnce();
    s.store.dispose();
  });
  it("upload retry is explicit, has a fresh identity, and invalid MIME never uploads", async () => {
    const s = setup(); s.store.add("A", [file()]); s.calls[0].reject(new Error("private transport detail")); await Promise.resolve();
    expect(s.upload).toHaveBeenCalledOnce(); expect(s.store.get("A")[0].status).toBe("failed");
    s.store.retry("A", "1"); expect(s.store.get("A")[0].requestId).toBe(2);
    s.calls[1].resolve(result()); await Promise.resolve(); expect(s.store.get("A")[0].status).toBe("uploaded");
    s.store.add("B", [file("fake.png", "application/pdf")]); expect(s.upload).toHaveBeenCalledTimes(2);
    expect(s.store.get("B")[0]).toMatchObject({ status: "failed", previewUrl: null, retryable: false }); s.store.dispose();
  });
  it("deleting a conversation and unmounting release resources and suppress late updates", async () => {
    const s = setup(); s.store.add("A", [file()]); s.store.add("B", [file("b.png")]); s.store.delete("A"); s.store.dispose();
    s.calls.forEach(call => call.resolve(result())); await Promise.resolve();
    expect(s.store.get("A")).toEqual([]); expect(s.store.get("B")).toEqual([]); expect(s.revoke).toHaveBeenCalledTimes(2);
  });
});
