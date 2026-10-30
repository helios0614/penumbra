import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { DiaryContractError, DiaryUnavailableError, type ArchivedDiary, type DiaryCalendar } from "@/domain/diary";
import { DiaryWriteRejectedError } from "@/domain/diary/diary-write-client";
import { createDiaryReaderController } from "./diary-reader-controller";
import { diaryDraft, diaryUpdate, hasDiaryEdits } from "./diary-actions-state";

const original: ArchivedDiary = { id: "entry", date: "2026-10-09", title: null, content: "完整正文\n\n第二段🦉", tags: ["shared_moment", "未知分类"], keywords: ["猫", "长关键词\n保留内部换行"], importance: 0.6 };
const index: DiaryCalendar = { month: "2026-10", items: [{ date: original.date, entryId: original.id, title: null, entryStatus: "done", hasDiaryMessages: true, hasSavedContent: true, calendarState: "archived", invalidReason: null }] };
const controllers: ReturnType<typeof createDiaryReaderController>[] = [];
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function setup() {
  let saved = original, enabled = false;
  const api = {
    getArchivedDiary: vi.fn(async () => saved), getDiaryCalendar: vi.fn(async () => index),
    updateArchivedDiary: vi.fn(async (_id: string, input: Parameters<typeof import("@/domain/diary/diary-write-client").updateArchivedDiary>[1]) => { saved = { ...saved, ...input, title: input.title ?? saved.title }; }),
    getDiaryAutoFeed: vi.fn(async () => enabled), setDiaryAutoFeed: vi.fn(async (next: boolean) => { enabled = next; return enabled; }),
  };
  const controller = createDiaryReaderController(api, () => "2026-10-23"); controllers.push(controller);
  await controller.load(); await controller.selectDate(original.date); await controller.openEntry(original.id);
  return { api, controller, setSaved: (entry: ArchivedDiary) => { saved = entry; } };
}
afterEach(() => { controllers.forEach((controller) => controller.dispose()); controllers.length = 0; });

describe("Diary archived editing lifecycle", () => {
  it("isolates draft from saved data and cancels an unchanged editor", async () => {
    const { controller, api } = await setup(); controller.beginEdit();
    expect(hasDiaryEdits(controller.getState().editor)).toBe(false);
    controller.changeDraft({ title: "修改", keywords: ["新关键词"] });
    expect(controller.getState().reader?.entry).toEqual(original); expect(original.keywords).toHaveLength(2);
    expect(hasDiaryEdits(controller.getState().editor)).toBe(true);
    controller.cancelEdit(); expect(controller.getState().editor).toBeNull(); expect(api.updateArchivedDiary).not.toHaveBeenCalled();
  });
  it("preflights, sends done/title/content, verifies all fields, and synchronizes reader, preview and calendar title", async () => {
    const { controller, api } = await setup(); controller.beginEdit();
    controller.changeDraft({ title: "新标题", content: "长正文🦉\n\n".repeat(300), tags: ["emotion"], keywords: ["论坛", "亲近"], importance: 0 });
    const expected = controller.getState().editor!.draft;
    await controller.saveEdit();
    expect(api.updateArchivedDiary).toHaveBeenCalledWith(original.id, { ...expected, status: "done" }, { signal: expect.any(AbortSignal), timeoutMs: 60_000 });
    expect(api.getArchivedDiary).toHaveBeenCalledTimes(3);
    expect(controller.getState()).toMatchObject({ editor: null, notice: { text: "日记已保存" }, reader: { date: original.date, entry: expected }, preview: { entry: expected } });
    expect(controller.getState().notice?.description).toBeUndefined();
    controller.back(); expect(controller.getState().calendar?.items[0].title).toBe("新标题");
    expect(api.updateArchivedDiary).toHaveBeenCalledTimes(1);
  });
  it("changes metadata without replacing untouched content, importance or internal fields", async () => {
    const { controller, api } = await setup(); controller.beginEdit(); controller.changeDraft({ tags: [] });
    await controller.saveEdit(); expect(api.updateArchivedDiary.mock.calls[0][1]).toEqual({ status: "done", tags: [] });
  });
  it("allows an empty title while preserving the full saved body for title embedding", async () => {
    const { controller, setSaved, api } = await setup(); const titled = { ...original, title: "有标题" }; setSaved(titled);
    await controller.refresh(); controller.beginEdit(); controller.changeDraft({ title: "" }); await controller.saveEdit();
    expect(api.updateArchivedDiary.mock.calls[0][1]).toEqual({ status: "done", title: "", content: original.content });
    expect(controller.getState().reader?.entry?.title).toBe("");
  });
  it("rejects empty content and missing or invalid editable importance without PUT", async () => {
    const { controller, api } = await setup(); controller.beginEdit(); controller.changeDraft({ content: "\u0085\u001c" }); await controller.saveEdit();
    expect(controller.getState().editor?.error).toContain("有效正文");
    controller.changeDraft({ content: original.content, importance: 2 }); await controller.saveEdit(); expect(controller.getState().editor?.error).toContain("0 到 1");
    controller.changeDraft({ importance: null }); await controller.saveEdit(); expect(controller.getState().editor?.error).toContain("不能留空");
    expect(api.updateArchivedDiary).not.toHaveBeenCalled();
  });
  it("does not invent importance when absent and keeps untouched nullable metadata omitted", async () => {
    const { controller, setSaved, api } = await setup(); const without = { ...original, importance: null }; setSaved(without); await controller.refresh();
    controller.beginEdit(); controller.changeDraft({ content: "新正文" }); await controller.saveEdit();
    expect(api.updateArchivedDiary.mock.calls[0][1]).toEqual({ status: "done", title: "", content: "新正文" });
    expect(controller.getState().reader?.entry?.importance).toBeNull();
  });
  it("does not send a write when preflight detects another client's changes", async () => {
    const { controller, api, setSaved } = await setup(); controller.beginEdit(); controller.changeDraft({ content: "自己的草稿" });
    setSaved({ ...original, content: "其他客户端" }); await controller.saveEdit();
    expect(api.updateArchivedDiary).not.toHaveBeenCalled(); expect(controller.getState().editor).toMatchObject({ conflict: true, draft: { content: "自己的草稿" } });
  });
  it("blocks duplicate saves and cancellation while a save is in flight", async () => {
    const { controller, api } = await setup(), delayed = deferred<void>(); controller.beginEdit(); controller.changeDraft({ content: "要保存" });
    api.updateArchivedDiary.mockImplementationOnce(() => delayed.promise);
    const saving = controller.saveEdit(); await Promise.resolve();
    await controller.saveEdit(); controller.cancelEdit(); controller.changeDraft({ content: "不能改动" }); controller.back();
    expect(controller.getState().editor?.draft.content).toBe("要保存"); expect(api.updateArchivedDiary).toHaveBeenCalledTimes(1);
    delayed.resolve(); await saving; expect(controller.getState().editor?.uncertain).toBe(true); // 200 without changing the record is not success.
  });
  it.each([new ApiError("timeout", 0, null, "TIMEOUT"), new ApiError("network", 0), new ApiError("server", 500), new DiaryContractError()])("keeps unknown save outcomes, never repeats PUT, and reconciles through GET", async (error) => {
    const { controller, api, setSaved } = await setup(); controller.beginEdit(); controller.changeDraft({ content: "保留的草稿" });
    api.updateArchivedDiary.mockRejectedValueOnce(error); await controller.saveEdit();
    expect(controller.getState().editor).toMatchObject({ uncertain: true, draft: { content: "保留的草稿" } }); expect(controller.getState().notice).toBeNull();
    await controller.saveEdit(); await controller.verifyEdit(); expect(api.updateArchivedDiary).toHaveBeenCalledTimes(1);
    expect(controller.getState().editor?.uncertain).toBe(true);
    controller.changeDraft({ title: "核对期间的新修改" }); setSaved({ ...original, title: "", content: "保留的草稿" }); await controller.verifyEdit();
    expect(controller.getState().editor).toMatchObject({ uncertain: false, baseline: { content: "保留的草稿" }, draft: { title: "核对期间的新修改" } });
  });
  it.each([new DiaryWriteRejectedError(), new ApiError("denied", 403)])("retains editable draft after a definite rejection and permits an explicit retry", async (error) => {
    const { controller, api } = await setup(); controller.beginEdit(); controller.changeDraft({ content: "第一次草稿" }); api.updateArchivedDiary.mockRejectedValueOnce(error);
    await controller.saveEdit(); expect(controller.getState().editor).toMatchObject({ uncertain: false, draft: { content: "第一次草稿" } });
    controller.changeDraft({ content: "第二次草稿" }); await controller.saveEdit(); expect(controller.getState().editor).toBeNull();
    expect(controller.getState().reader?.entry?.content).toBe("第二次草稿");
  });
  it("does not treat ok:true on a deleted record or a failed readback as saved", async () => {
    const { controller, api } = await setup(); controller.beginEdit(); controller.changeDraft({ title: "无法验证" });
    api.getArchivedDiary.mockResolvedValueOnce(original).mockRejectedValueOnce(new DiaryUnavailableError()); await controller.saveEdit();
    expect(controller.getState().notice).toBeNull(); expect(controller.getState().editor?.uncertain).toBe(true); expect(controller.getState().reader?.entry).toEqual(original);
  });
  it("suppresses late save results and notifications after unmount", async () => {
    const { controller, api } = await setup(), delayed = deferred<void>(), listener = vi.fn(); controller.beginEdit(); controller.changeDraft({ title: "离开" });
    api.updateArchivedDiary.mockImplementationOnce(() => delayed.promise); const saving = controller.saveEdit(); await Promise.resolve();
    controller.subscribe(listener); controller.dispose(); delayed.resolve(); await saving; expect(listener).not.toHaveBeenCalled();
  });
  it("builds drafts without splitting internal newlines or changing keyword order", async () => {
    const { controller } = await setup(); controller.beginEdit();
    expect(controller.getState().editor?.draft).toEqual(diaryDraft(original));
    expect(diaryUpdate(controller.getState().editor!)).toEqual({ status: "done" });
  });
  it("normalizes only optional list whitespace at submission and verifies the projected result", async () => {
    const { controller } = await setup(); controller.beginEdit(); controller.changeDraft({ keywords: [" 亲近 ", "猫\n日常"] });
    expect(controller.getState().editor?.draft.keywords[0]).toBe(" 亲近 ");
    await controller.saveEdit(); expect(controller.getState().reader?.entry?.keywords).toEqual(["亲近", "猫\n日常"]); expect(controller.getState().editor).toBeNull();
  });
});

describe("Diary real global automatic feed setting", () => {
  it("starts unknown, reads real state independently of month, then POSTs and re-reads confirmation", async () => {
    const { controller, api } = await setup(); expect(controller.getState().autoFeed.enabled).toBeNull();
    await controller.loadAutoFeed(); expect(controller.getState().autoFeed.enabled).toBe(false);
    await controller.toggleAutoFeed(true); expect(controller.getState().autoFeed.enabled).toBe(true); expect(api.setDiaryAutoFeed).toHaveBeenCalledTimes(1);
    expect(api.getDiaryAutoFeed).toHaveBeenCalledTimes(2); expect(controller.getState().notice?.text).toBe("自动投喂记忆已开启");
    controller.back(); await controller.selectMonth("2026-11"); expect(controller.getState().autoFeed.enabled).toBe(true);
  });
  it("does not turn failed initial reads into a confirmed off state", async () => {
    const { controller, api } = await setup(); api.getDiaryAutoFeed.mockRejectedValueOnce(new Error("offline")); await controller.loadAutoFeed();
    expect(controller.getState().autoFeed).toMatchObject({ enabled: null, loading: false }); expect(controller.getState().autoFeed.error).toBeTruthy();
    await controller.toggleAutoFeed(true); expect(api.setDiaryAutoFeed).not.toHaveBeenCalled();
  });
  it("keeps confirmed state on rejection and prevents duplicate clicks during saving", async () => {
    const { controller, api } = await setup(); await controller.loadAutoFeed(); const delayed = deferred<boolean>(); api.setDiaryAutoFeed.mockImplementationOnce(() => delayed.promise);
    const toggling = controller.toggleAutoFeed(true); await controller.toggleAutoFeed(true); expect(api.setDiaryAutoFeed).toHaveBeenCalledTimes(1);
    expect(controller.getState().autoFeed).toMatchObject({ enabled: false, saving: true }); delayed.reject(new ApiError("denied", 403)); await toggling;
    expect(controller.getState().autoFeed).toMatchObject({ enabled: false, saving: false, uncertain: false });
  });
  it("keeps an unknown outcome locked until read-only verification confirms the target", async () => {
    const { controller, api } = await setup(); await controller.loadAutoFeed(); api.setDiaryAutoFeed.mockRejectedValueOnce(new ApiError("timeout", 0, null, "TIMEOUT"));
    await controller.toggleAutoFeed(true); await controller.toggleAutoFeed(true); await controller.loadAutoFeed();
    expect(controller.getState().autoFeed).toMatchObject({ enabled: false, uncertain: true }); expect(api.setDiaryAutoFeed).toHaveBeenCalledTimes(1);
    api.getDiaryAutoFeed.mockResolvedValueOnce(true); await controller.loadAutoFeed(); expect(controller.getState().autoFeed).toMatchObject({ enabled: true, uncertain: false });
  });
  it("does not emit success when POST receipt and confirmed setting disagree", async () => {
    const { controller, api } = await setup(); await controller.loadAutoFeed(); api.setDiaryAutoFeed.mockResolvedValueOnce(true); await controller.toggleAutoFeed(true);
    expect(controller.getState().autoFeed).toMatchObject({ enabled: false, saving: false }); expect(controller.getState().notice).toBeNull();
  });
  it("aborts replaced reads and ignores stale global settings after a newer read or unmount", async () => {
    const { controller, api } = await setup(), delayed = deferred<boolean>(); api.getDiaryAutoFeed.mockImplementationOnce(() => delayed.promise);
    const first = controller.loadAutoFeed(); await controller.loadAutoFeed(); delayed.resolve(true); await first; expect(controller.getState().autoFeed.enabled).toBe(false);
    const next = deferred<boolean>(); api.getDiaryAutoFeed.mockImplementationOnce(() => next.promise); const reading = controller.loadAutoFeed(); controller.dispose(); next.resolve(true); await reading;
    expect(controller.getState().autoFeed.enabled).toBe(false);
  });
  it("keeps a confirmed state and unknown flag when POST succeeds but its confirmation GET fails", async () => {
    const { controller, api } = await setup(); await controller.loadAutoFeed(); api.getDiaryAutoFeed.mockRejectedValueOnce(new Error("offline"));
    await controller.toggleAutoFeed(true); expect(controller.getState().autoFeed).toMatchObject({ enabled: false, uncertain: true, saving: false });
    expect(controller.getState().notice).toBeNull(); await controller.toggleAutoFeed(true); expect(api.setDiaryAutoFeed).toHaveBeenCalledTimes(1);
    await controller.loadAutoFeed(); expect(controller.getState().autoFeed).toMatchObject({ enabled: true, uncertain: false });
  });
});
