import { describe, expect, it, vi } from "vitest";
import type { ArchivedDiary } from "@/domain/diary";
import { ApiError } from "@/lib/api";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";
import { DiaryWriteRejectedError } from "@/domain/diary/diary-write-client";
import { createDiaryExtractionController } from "./diary-extraction-controller";
import { createDiaryReaderController } from "@/application/diary-reader/diary-reader-controller";

const source: DiaryMessage = { entryId: "entry", id: "ai", role: "assistant", content: "【标题】标题\n【正文】第一段\n\n第二段\n【关键词】甲，乙\n【标签】共同经历\n【重要性】0.8", createdAt: 1, updatedAt: null, drift: null, thinking: null };
const date = "2026-11-03";
function setup() {
  const onSaved = vi.fn();
  let saved: ArchivedDiary = { id: source.entryId, date, title: "原标题", content: "原正文", tags: ["emotion"], keywords: ["原词"], importance: 0.2 };
  const deps = {
    getDiaryChatEntry: vi.fn(async () => ({ id: source.entryId, date, title: "原标题", status: "writing" })),
    getDiaryMessages: vi.fn(async () => [source]),
    getArchivedDiary: vi.fn(async () => saved),
    updateArchivedDiary: vi.fn(async (_id: string, input: Parameters<typeof import("@/domain/diary/diary-write-client").updateArchivedDiary>[1]) => { saved = { ...saved, ...input }; }),
  };
  return { controller: createDiaryExtractionController(onSaved, deps), deps, onSaved };
}
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe("Diary extraction preview and explicit archive", () => {
  it("keeps extraction and cancellation entirely local, including for archived entries", () => {
    const { controller, deps } = setup();
    expect(controller.open(source, date)).toBe(true); controller.change({ content: "人工修改" }); controller.cancel();
    expect(controller.getState().preview).toBeNull();
    for (const call of Object.values(deps)) expect(call).not.toHaveBeenCalled();
  });
  it("does not create a preview or write when parsing fails or the role is wrong", () => {
    const { controller, deps } = setup();
    expect(controller.open({ ...source, content: "普通聊天" }, date)).toBe(false);
    expect(controller.getState().error).toContain("无法提取");
    expect(controller.open({ ...source, role: "user" }, date)).toBe(false);
    expect(deps.updateArchivedDiary).not.toHaveBeenCalled();
  });
  it("writes only after confirmation, then verifies target identity and every submitted field", async () => {
    const { controller, deps, onSaved } = setup(); controller.open(source, date);
    controller.change({ title: "人工标题", content: "人工\n\n全文", importance: 0, tags: ["emotion"], keywords: ["乙", "甲"] });
    expect(await controller.save()).toBe(true);
    expect(deps.updateArchivedDiary).toHaveBeenCalledWith("entry", { status: "done", title: "人工标题", content: "人工\n\n全文", importance: 0, tags: ["emotion"], keywords: ["乙", "甲"] }, { signal: expect.any(AbortSignal), timeoutMs: 60_000 });
    expect(deps.getArchivedDiary).toHaveBeenCalledWith("entry", date, { signal: expect.any(AbortSignal) });
    expect(deps.updateArchivedDiary.mock.invocationCallOrder[0]).toBeLessThan(deps.getArchivedDiary.mock.invocationCallOrder[0]);
    expect(onSaved).toHaveBeenCalledOnce(); expect(controller.getState().preview).toBeNull();
  });
  it("allows missing optional fields and preserves omitted importance according to PUT contract", async () => {
    const { controller, deps, onSaved } = setup(); controller.open({ ...source, content: "【正文】仅正文" }, date);
    deps.getDiaryMessages.mockResolvedValue([{ ...source, content: "【正文】仅正文" }]);
    expect(await controller.save()).toBe(true);
    expect(deps.updateArchivedDiary.mock.calls[0][1]).toEqual({ status: "done", title: "", content: "仅正文", tags: [], keywords: [] });
    expect(onSaved.mock.calls[0][0].importance).toBe(0.2);
  });
  it("previews and saves merged Markdown without changing the persisted source message", async () => {
    const { controller, deps, onSaved } = setup();
    const message = { ...source, content: "【正文】**第一段**  \n继续\n\n【重要性】无效\n【正文】\n- 第二段\n  - 子项\n\n" };
    deps.getDiaryMessages.mockResolvedValue([message]);
    expect(controller.open(message, date)).toBe(true);
    const content = "**第一段**  \n继续\n\n- 第二段\n  - 子项\n\n";
    expect(controller.getState().preview?.draft.content).toBe(content); expect(deps.updateArchivedDiary).not.toHaveBeenCalled();
    expect(await controller.save()).toBe(true); expect(deps.updateArchivedDiary.mock.calls[0][1].content).toBe(content);
    expect(onSaved.mock.calls[0][0]).toMatchObject({ content, importance: 0.2 });
    expect(message.content).toContain("【重要性】无效");
  });
  it.each(["", "\u0085\u001c"])("rejects empty edited body without writes: %s", async content => {
    const { controller, deps } = setup(); controller.open(source, date); controller.change({ content }); await controller.save();
    expect(deps.updateArchivedDiary).not.toHaveBeenCalled(); expect(controller.getState().preview?.draft.content).toBe(content);
  });
  it("rejects invalid manual importance before writing", async () => {
    const { controller, deps } = setup(); controller.open(source, date); controller.change({ importance: 2 }); await controller.save();
    expect(deps.updateArchivedDiary).not.toHaveBeenCalled();
  });
  it.each([new DiaryWriteRejectedError(), new ApiError("rejected", 422, null, "HTTP_ERROR")])("retains failed drafts and permits manual retry after a definite rejection", async error => {
    const { controller, deps } = setup(); controller.open(source, date); controller.change({ title: "保留" });
    deps.updateArchivedDiary.mockRejectedValueOnce(error); expect(await controller.save()).toBe(false);
    expect(controller.getState()).toMatchObject({ uncertain: false, preview: { draft: { title: "保留" } } });
    expect(await controller.save()).toBe(true); expect(deps.updateArchivedDiary).toHaveBeenCalledTimes(2);
  });
  it("retains uncertain drafts and provides GET-only verification without repeating PUT", async () => {
    const { controller, deps } = setup(); controller.open(source, date);
    deps.getArchivedDiary.mockRejectedValueOnce(new Error()); await controller.save();
    expect(controller.getState()).toMatchObject({ uncertain: true, preview: { draft: { title: "标题" } } });
    await controller.save(); expect(deps.updateArchivedDiary).toHaveBeenCalledOnce();
    expect(await controller.verify()).toBe(true); expect(deps.updateArchivedDiary).toHaveBeenCalledOnce();
  });
  it.each([{ id: "another" }, { date: "2026-11-04" }, { title: "不一致" }, { content: "不一致" }, { importance: 0.1 }, { tags: [] }, { keywords: [] }])("does not accept an ok receipt with wrong readback: %j", async patch => {
    const { controller, deps, onSaved } = setup(); controller.open(source, date);
    const expected = controller.getState().preview!.draft;
    deps.getArchivedDiary.mockResolvedValue({ ...expected, id: "entry", date, importance: 0.8, ...patch });
    expect(await controller.save()).toBe(false); expect(onSaved).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ uncertain: true, preview: { draft: expected } });
  });
  it.each([[], [{ ...source, id: "regenerated" }], [{ ...source, content: "已变化" }], [{ ...source, entryId: "other" }]].map(messages => ({ messages })))("invalidates deleted/regenerated/changed sources before PUT", async ({ messages }) => {
    const { controller, deps } = setup(); controller.open(source, date); deps.getDiaryMessages.mockResolvedValue(messages);
    expect(await controller.save()).toBe(false); expect(deps.updateArchivedDiary).not.toHaveBeenCalled();
    expect(controller.getState().preview?.invalid).toBe(true);
  });
  it("invalidates an observed source disappearance, keeping it unavailable if an old snapshot returns", async () => {
    const { controller, deps } = setup(); controller.open(source, date); controller.observe("entry", []); controller.observe("entry", [source]);
    expect(controller.getState().preview?.invalid).toBe(true); await controller.save(); expect(deps.updateArchivedDiary).not.toHaveBeenCalled();
  });
  it("blocks duplicate confirmation, edits and cancellation during a write", async () => {
    const { controller, deps } = setup(), pending = deferred<void>(); controller.open(source, date);
    deps.updateArchivedDiary.mockImplementationOnce(() => pending.promise);
    const saving = controller.save(); await vi.waitFor(() => expect(deps.updateArchivedDiary).toHaveBeenCalledOnce());
    await controller.save(); controller.cancel(); controller.change({ title: "不能改" });
    expect(controller.getState().preview?.draft.title).toBe("标题"); pending.resolve(); await saving;
    expect(deps.updateArchivedDiary).toHaveBeenCalledOnce();
  });
  it("does not send or publish late results after navigation/disposal", async () => {
    const { controller, deps, onSaved } = setup(), pending = deferred<Awaited<ReturnType<typeof deps.getDiaryChatEntry>>>();
    controller.open(source, date); deps.getDiaryChatEntry.mockReturnValue(pending.promise);
    const saving = controller.save(); controller.dispose(); pending.resolve({ id: "entry", date, title: "", status: "writing" }); await saving;
    expect(deps.updateArchivedDiary).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("calendar best effort extraction", () => {
  it.each(["writing", "done"])("finds the most recent parseable saved assistant independent of %s status", async status => {
    const { controller, deps } = setup(); deps.getDiaryChatEntry.mockResolvedValue({ id: "entry", date, title: "标题", status });
    deps.getDiaryMessages.mockResolvedValue([source, { ...source, id: "newer", content: "【正文】最新可提取" }, { ...source, id: "chat", content: "还有别的想聊的吗？" }, { ...source, id: "user", role: "user", content: "【正文】用户示例" }]);
    expect(await controller.quickExtract("entry", date)).toBe(true); expect(controller.getState().preview?.source.id).toBe("newer");
    expect(deps.updateArchivedDiary).not.toHaveBeenCalled();
  });
  it.each([[], [{ ...source, content: "普通聊天" }]].map(messages => ({ messages })))("fails lightly without Entry mutation", async ({ messages }) => {
    const { controller, deps } = setup(); deps.getDiaryMessages.mockResolvedValue(messages);
    expect(await controller.quickExtract("entry", date)).toBe(false); expect(controller.getState().error).toContain("暂未找到");
    expect(deps.updateArchivedDiary).not.toHaveBeenCalled();
  });
  it("ignores a quick extraction completing after date selection changes", async () => {
    const { controller, deps } = setup(), pending = deferred<DiaryMessage[]>(); deps.getDiaryMessages.mockReturnValue(pending.promise);
    const extracting = controller.quickExtract("entry", date); await vi.waitFor(() => expect(deps.getDiaryMessages).toHaveBeenCalled());
    controller.reset(); pending.resolve([source]); await extracting; expect(controller.getState().preview).toBeNull();
  });
  it("updates the calendar, cached preview and reader only from a verified archive", async () => {
    const { controller, deps } = setup(); controller.open(source, date); await controller.save(); const archived = await deps.getArchivedDiary();
    const reader = createDiaryReaderController({ getDiaryCalendar: vi.fn(async () => ({ month: "2026-11", items: [{ entryId: "entry", date, title: null, entryStatus: "writing", hasDiaryMessages: true, hasSavedContent: false, calendarState: "pending" as const, invalidReason: null }] })), getArchivedDiary: deps.getArchivedDiary }, () => date);
    await reader.load(); reader.acceptArchive(archived);
    expect(reader.getState().calendar?.items[0]).toMatchObject({ entryId: "entry", entryStatus: "done", hasSavedContent: true, calendarState: "archived", title: "标题" });
    expect(reader.getState().preview?.entry).toEqual(archived);
    await reader.openEntry("entry"); expect(reader.getState().reader?.entry).toEqual(archived); reader.dispose();
  });
});
