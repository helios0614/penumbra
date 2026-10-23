import * as React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { hasDiaryEdits } from "@/application/diary-reader/diary-actions-state";
import type { ArchivedDiary, DiaryCalendar } from "@/domain/diary";
import { DiaryWriteRejectedError } from "@/domain/diary/diary-write-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiaryEditor } from "./DiaryEditor";
import { DiaryKeywordEditor } from "./DiaryKeywordEditor";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef), useLayoutEffect: vi.fn(actual.useLayoutEffect) };
});
const actualReact = await vi.importActual<typeof React>("react");
function restoreHooks() {
  vi.mocked(React.useState).mockImplementation(actualReact.useState);
  vi.mocked(React.useRef).mockImplementation(actualReact.useRef);
  vi.mocked(React.useLayoutEffect).mockImplementation(actualReact.useLayoutEffect);
}
afterEach(() => { restoreHooks(); vi.restoreAllMocks(); });

type Element = React.ReactElement<Record<string, unknown>>;
function all(node: React.ReactNode, predicate: (element: Element) => boolean): Element[] {
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children as React.ReactNode).flatMap((child) => all(child, predicate))];
}
function call(node: React.ReactNode, label: string, name = "onClick", value?: unknown) {
  const control = all(node, (element) => element.props["aria-label"] === label)[0];
  expect(control, label).toBeDefined();
  (control.props[name] as (input?: unknown) => void)(value);
}

// Exercise the real component callbacks across rerenders, without a browser or DOM engine.
function session(read: () => readonly string[], write: (words: readonly string[]) => void) {
  const state: unknown[] = [], refs: { current: unknown }[] = [], focus = vi.fn(), selectors: string[] = [];
  return {
    focus, selectors,
    render(disabled = false) {
      let stateIndex = 0, refIndex = 0;
      const effects: (() => unknown)[] = [];
      vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
        const index = stateIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value: unknown) => { state[index] = value; }];
      }) as typeof React.useState);
      vi.mocked(React.useRef).mockImplementation(((initial: unknown) => {
        const index = refIndex++;
        return refs[index] ??= { current: initial };
      }) as typeof React.useRef);
      vi.mocked(React.useLayoutEffect).mockImplementation((effect) => { effects.push(effect); });
      try {
        const tree = DiaryKeywordEditor({ values: read(), disabled, onChange: write });
        refs[0].current = { querySelector: (selector: string) => { selectors.push(selector); return { focus }; } };
        effects.forEach((effect) => effect());
        return tree;
      } finally { restoreHooks(); }
    },
  };
}
function draftSession(initial: readonly string[]) {
  let words = initial;
  const change = vi.fn((value: readonly string[]) => { words = value; });
  return { ...session(() => words, change), words: () => words, change };
}
function edit(tree: React.ReactNode, index: number) {
  const control = all(tree, (node) => node.props["data-diary-keyword-edit"] === index)[0];
  expect(control).toBeDefined(); (control.props.onClick as () => void)();
}
function add(tree: React.ReactNode) {
  const control = all(tree, (node) => node.props["data-diary-keyword-add"] !== undefined)[0];
  (control.props.onClick as () => void)();
}
function key(tree: React.ReactNode, label: string, value: string, composing = false) {
  const event = { key: value, nativeEvent: { isComposing: composing }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  call(tree, label, "onKeyDown", event); return event;
}

describe("Diary compact keyword draft editing", () => {
  it("renders wrapping chips, including empty, duplicate and long values, in the original order", () => {
    const values = ["第二", "第一", "", "第二", "长词🦉".repeat(300), ...Array.from({ length: 80 }, (_, index) => `词${index}`)];
    const s = draftSession(values), tree = s.render(), html = renderToStaticMarkup(tree);
    expect(all(tree, (node) => node.type === Input)).toHaveLength(0);
    const chips = all(tree, (node) => node.props["data-diary-keyword-edit"] !== undefined);
    expect(chips).toHaveLength(values.length);
    expect(chips.map((node) => node.props.title)).toEqual(values.map((value) => value || "空关键词"));
    expect(html).not.toContain("textarea"); expect(html).toContain(values[4]); expect(html).toContain("词79");
    expect(all(tree, (node) => node.props["aria-label"] === "移除关键词 3")).toHaveLength(1);
    expect(s.change).not.toHaveBeenCalled();
  });

  it("edits provisionally in the existing draft, confirms with Enter, and restores with Escape", () => {
    const s = draftSession(["一", "二", "三"]);
    edit(s.render(), 1);
    let tree = s.render();
    expect(all(tree, (node) => node.type === Input)[0].props.autoFocus).toBe(true);
    call(tree, "关键词 2", "onChange", { target: { value: "未确认也在草稿" } });
    expect(s.words()).toEqual(["一", "未确认也在草稿", "三"]);
    tree = s.render();
    const enter = key(tree, "关键词 2", "Enter"); expect(enter.preventDefault).toHaveBeenCalledOnce(); expect(enter.stopPropagation).toHaveBeenCalledOnce();
    expect(all(s.render(), (node) => node.type === Input)).toHaveLength(0);
    expect(s.selectors[s.selectors.length - 1]).toBe('[data-diary-keyword-edit="1"]');
    edit(s.render(), 1); tree = s.render();
    call(tree, "关键词 2", "onChange", { target: { value: "撤销这次修改" } });
    tree = s.render(); key(tree, "关键词 2", "Escape"); s.render();
    expect(s.words()).toEqual(["一", "未确认也在草稿", "三"]); expect(s.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("adds, confirms and removes through touch buttons without sorting or deduplication", () => {
    const s = draftSession(["二", "一"]);
    add(s.render()); let tree = s.render();
    expect(s.words()).toEqual(["二", "一", ""]);
    call(tree, "关键词 3", "onChange", { target: { value: "二" } });
    tree = s.render(); call(tree, "确认关键词修改");
    expect(s.words()).toEqual(["二", "一", "二"]);
    tree = s.render(); call(tree, "移除关键词 2");
    expect(s.words()).toEqual(["二", "二"]);
    add(s.render()); tree = s.render(); call(tree, "关键词 3", "onChange", { target: { value: "撤销新增" } });
    call(s.render(), "取消关键词修改"); s.render();
    expect(s.words()).toEqual(["二", "二"]); expect(s.selectors[s.selectors.length - 1]).toBe("[data-diary-keyword-add]");
  });

  it("retains the active draft on ordinary rerenders and IME confirmation, and disables operations while saving", () => {
    const s = draftSession(["原词"]); edit(s.render(), 0);
    call(s.render(), "关键词 1", "onChange", { target: { value: "中文输入🦉" } });
    let tree = s.render(); const event = key(tree, "关键词 1", "Enter", true);
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(all(s.render(), (node) => node.type === Input)[0].props.value).toBe("中文输入🦉");
    tree = s.render(true);
    for (const control of all(tree, (node) => node.type === Button || node.type === Input)) expect(control.props.disabled).toBe(true);
    key(tree, "关键词 1", "Escape"); call(tree, "取消关键词修改"); add(tree);
    expect(s.words()).toEqual(["中文输入🦉"]); expect(all(s.render(), (node) => node.type === Input)).toHaveLength(1);
    call(s.render(), "取消关键词修改"); expect(s.words()).toEqual(["原词"]);
  });

  it("preserves internal CR/LF and pasted multiline content inside one keyword", () => {
    const s = draftSession(["第一\r\n第二\r第三\n最后", "另一词"]); edit(s.render(), 0);
    let tree = s.render(); const fields = all(tree, (node) => node.type === Input);
    expect(fields.map((node) => node.props.value)).toEqual(["第一", "第二", "第三", "最后"]);
    call(tree, "关键词 1，第 2 段", "onChange", { target: { value: "改第二" } });
    expect(s.words()[0]).toBe("第一\r\n改第二\r第三\n最后");
    tree = s.render(); const preventDefault = vi.fn();
    call(tree, "关键词 1，第 3 段", "onPaste", { clipboardData: { getData: () => "甲\n乙" }, currentTarget: { selectionStart: 0, selectionEnd: 2 }, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(s.words()).toEqual(["第一\r\n改第二\r甲\n乙\n最后", "另一词"]);
    call(s.render(), "取消关键词修改"); expect(s.words()).toEqual(["第一\r\n第二\r第三\n最后", "另一词"]);
  });

  it("keeps the correct edit target when a preceding chip is deleted", () => {
    const s = draftSession(["一", "二", "三"]); edit(s.render(), 2);
    call(s.render(), "关键词 3", "onChange", { target: { value: "修改三" } });
    call(s.render(), "移除关键词 1");
    const tree = s.render(); expect(all(tree, (node) => node.type === Input)[0].props.value).toBe("修改三");
    key(tree, "关键词 2", "Escape"); expect(s.words()).toEqual(["二", "三"]);
  });
});

describe("Diary keyword chips use the unchanged save lifecycle", () => {
  async function setup() {
    const entry: ArchivedDiary = { id: "entry", date: "2026-10-09", title: "", content: "完整正文\n\n末段🦉".repeat(400), tags: ["shared_moment"], keywords: ["二", "一", "词\n内部换行"], importance: 0.6 };
    let saved = entry;
    const calendar: DiaryCalendar = { month: "2026-10", items: [{ date: entry.date, entryId: entry.id, title: entry.title, entryStatus: "done", hasDiaryMessages: true, hasSavedContent: true, calendarState: "archived", invalidReason: null }] };
    const api = { getArchivedDiary: vi.fn(async () => saved), getDiaryCalendar: vi.fn(async () => calendar), updateArchivedDiary: vi.fn(async (_id: string, update: { keywords?: readonly string[] }) => { saved = { ...saved, keywords: update.keywords ?? saved.keywords }; }) };
    const controller = createDiaryReaderController(api, () => "2026-10-23");
    await controller.load(); await controller.selectDate(entry.date); await controller.openEntry(entry.id); controller.beginEdit();
    const s = session(() => controller.getState().editor!.draft.keywords, (keywords) => controller.changeDraft({ keywords }));
    return { entry, controller, api, s };
  }

  it("leaves saved content untouched on cancellation, and includes an active input in the top Save", async () => {
    const { entry, controller, api, s } = await setup();
    try {
      edit(s.render(), 0); call(s.render(), "关键词 1", "onChange", { target: { value: "未保存" } });
      call(s.render(), "移除关键词 2");
      expect(hasDiaryEdits(controller.getState().editor)).toBe(true); expect(controller.getState().reader?.entry).toEqual(entry);
      controller.cancelEdit(); expect(api.updateArchivedDiary).not.toHaveBeenCalled(); expect(controller.getState().reader?.entry).toEqual(entry);
      controller.beginEdit();
      const next = session(() => controller.getState().editor!.draft.keywords, (keywords) => controller.changeDraft({ keywords }));
      add(next.render()); call(next.render(), "关键词 4", "onChange", { target: { value: "最后" } });
      const tree = DiaryEditor({ editor: controller.getState().editor!, controller, onCancel: vi.fn() });
      const save = all(tree, (node) => node.type === Button && node.props["aria-busy"] === false)[0];
      (save.props.onClick as () => void)();
      await vi.waitFor(() => expect(controller.getState().editor).toBeNull());
      expect(api.updateArchivedDiary.mock.calls[0][1]).toEqual({ status: "done", keywords: ["二", "一", "词\n内部换行", "最后"] });
      expect(api.getArchivedDiary).toHaveBeenCalledTimes(3);
      expect(controller.getState().reader?.entry).toEqual({ ...entry, keywords: ["二", "一", "词\n内部换行", "最后"] });
    } finally { controller.dispose(); }
  });

  it("keeps empty/duplicate validation and real save failures visible without the persistent technical notes", async () => {
    const { controller, api, s } = await setup();
    try {
      add(s.render()); call(s.render(), "确认关键词修改"); await controller.saveEdit();
      expect(controller.getState().editor?.error).toContain("空项或重复项"); expect(api.updateArchivedDiary).not.toHaveBeenCalled();
      edit(s.render(), 3); call(s.render(), "关键词 4", "onChange", { target: { value: "二" } }); await controller.saveEdit();
      expect(api.updateArchivedDiary).not.toHaveBeenCalled();
      call(s.render(), "关键词 4", "onChange", { target: { value: "保留草稿" } });
      api.updateArchivedDiary.mockRejectedValueOnce(new DiaryWriteRejectedError()); await controller.saveEdit();
      const editor = controller.getState().editor!, html = renderToStaticMarkup(<DiaryEditor editor={editor} controller={controller} onCancel={vi.fn()} />);
      expect(editor.draft.keywords).toEqual(["二", "一", "词\n内部换行", "保留草稿"]);
      expect(html).toContain('role="alert"'); expect(html).toContain(editor.error); expect(html).not.toMatch(/当前接口无法确认向量处理结果|后端没有版本锁/);
    } finally { controller.dispose(); }
  });
});

describe("Diary Editor local paper layout", () => {
  it("sizes the whole title from an inert wrapping mirror, without a resize handle or clipping", () => {
    const title = "超长标题🦉".repeat(250) + "\n最后一行\n";
    const entry = { id: "entry", date: "2026-10-09", title, content: "正文\n\n末段", tags: [], keywords: [], importance: 0.6 };
    const html = renderToStaticMarkup(<DiaryEditor editor={{ baseline: entry, draft: entry, submitted: null, busy: null, uncertain: false, conflict: false, error: null }} controller={null} onCancel={vi.fn()} />);
    expect(html).toContain(`aria-hidden="true">${title} </span>`);
    expect(html.match(/id="diary-edit-title"[^>]*rows="1">([\s\S]*?)<\/textarea>/)?.[1]).toBe(title);
    expect(html).toContain("diary-editor-title-wrap"); expect(html).not.toContain("line-clamp");
    const css = readFileSync(new URL("./diary-editor.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.diary-editor-title-wrap\s*\{[^}]*display: grid/);
    expect(css).toMatch(/\.diary-editor-title\s*\{[^}]*resize: none/);
    expect(css).toMatch(/\.diary-editor-title-measure\s*\{[^}]*white-space: pre-wrap/);
    expect(css).toMatch(/\.diary-editor-keywords\s*\{[^}]*flex-wrap: wrap/);
    expect(css).toMatch(/\.diary-keyword-chip\s*\{[^}]*max-inline-size: 100%/);
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
});
