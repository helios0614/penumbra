import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import { INITIAL_QUICK_NOTE_STATE, type QuickNoteEditor as EditorState } from "@/application/quick-note/quick-note-state";
import { normalizeOutput, type QuickNote, type TriggerConfig } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QuickNoteBackfillDialog, QuickNoteCandidateList, QuickNoteConfirmDialog, QuickNoteDiscardDialog, QuickNoteRetryDialog, type QuickNoteConfirmation } from "./QuickNoteDialogs";
import { QuickNoteDialogHeader } from "./QuickNoteDialogHeader";
import { QuickNoteEditor, QuickNoteEditorFields } from "./QuickNoteEditor";
import { QuickNoteDatePicker } from "./QuickNoteControls";
import { QuickNoteView } from "./QuickNoteView";
import { QuickNoteReader } from "./QuickNoteReader";
import * as hooks from "./useQuickNotes";
import * as navigationHooks from "./useQuickNoteNavigation";

// Inspect React composition and invoke the real callbacks without a DOM/browser.
// Viewport event handling is tested separately with an in-memory EventTarget.
vi.mock("./quick-note-dialog-viewport", () => ({ useQuickNoteDialogViewport: () => undefined }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState) };
});

const config: TriggerConfig = { hours: [5, 13, 20], labels: { "5": "夜晚", "13": "上午", "20": "下午" }, dayBoundaryHour: 5, timeZone: "Asia/Shanghai" };
const note: QuickNote = { id: "qn_1", periodStart: 1, periodEnd: 2, periodLabel: "夜晚", summary: "", output: "已保存<br>正文", createdAt: 3 };
const editor: EditorState = { baseline: note, draft: normalizeOutput(note.output), error: null, conflict: null, uncertain: false };
const state = { ...INITIAL_QUICK_NOTE_STATE, config, date: "2026-10-16" };
const css = readFileSync(new URL("./quick-note.css", import.meta.url), "utf8");

afterEach(() => vi.restoreAllMocks());

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}
function button(node: React.ReactNode, label: string) {
  const element = elements(node).find((child) => child.type === Button && child.props.children === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element as React.ReactElement<React.ComponentProps<typeof Button>>;
}
// Minimal hook state for direct component callbacks; does not emulate Base UI.
function session<T>(render: () => T) {
  const values: unknown[] = [];
  let cursor = 0;
  const useState = ((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  }) as typeof React.useState;
  return () => {
    cursor = 0;
    const spy = vi.spyOn(React, "useState").mockImplementation(useState);
    try { return render(); } finally { spy.mockRestore(); }
  };
}
function controllerMock() {
  const calls = { cancelEdit: vi.fn(), changeDraft: vi.fn(), saveEditor: vi.fn(), verifyEditor: vi.fn(), acceptConflict: vi.fn(), loadCandidates: vi.fn(), mutate: vi.fn() };
  return { calls, controller: calls as unknown as QuickNoteController };
}
function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("Quick Note dialog layout contracts", () => {
  it("keeps header/footer siblings outside a bounded, non-scrolling editor body", () => {
    const tree = session(() => QuickNoteEditor({ editor, busy: false, controller: null }))();
    const popup = find(tree, DialogContent);
    const parts = React.Children.toArray(popup.props.children) as React.ReactElement[];
    expect(parts.map((part) => part.type)).toEqual([QuickNoteDialogHeader, "div", DialogFooter]);
    expect(popup.props.className).toBe("quick-note-dialog");
    expect(parts[1].props).toMatchObject({ className: "quick-note-editor-body" });
    const surface = block(".quick-note-dialog[data-slot]");
    for (const rule of ["100dvh", "safe-area-inset-top", "safe-area-inset-bottom", "flex-direction: column", "overflow: hidden", "max-height:", "border-radius: 28px"]) expect(surface).toContain(rule);
    expect(block('.quick-note-dialog[data-quick-note-dialog="editor"]')).toContain("min(48rem, var(--quick-note-available-height))");
    const body = block(".quick-note-editor-body");
    expect(body).toContain("min-height: 0");
    expect(body).toContain("flex: 1 1 0");
    expect(body).toContain("overflow: hidden");
    const textarea = block('.quick-note-editor-body [data-slot="textarea"]');
    for (const rule of ["field-sizing: fixed", "min-height: 0", "height: 0", "resize: none", "overflow-y: auto"]) expect(textarea).toContain(rule);
    const footer = block('.quick-note-dialog > [data-slot="alert-dialog-footer"]');
    expect(footer).toContain("flex-shrink: 0");
    expect(footer).toContain("flex-flow: row wrap");
    expect(footer).toContain("margin: 0");
    expect(button(find(tree, DialogFooter), "取消编辑")).toBeDefined();
    expect(button(find(tree, DialogFooter), "保存正文")).toBeDefined();
  });

  it("preserves all long draft text with native input and a parallel bounded conflict preview", () => {
    const draft = "[HEART:保留]\n" + "长正文\n".repeat(2000);
    const html = renderToStaticMarkup(<QuickNoteEditorFields editor={{ ...editor, draft, error: "保存失败" }} busy={false} onChange={vi.fn()} />);
    expect(html).toContain(draft);
    expect(html).toContain('data-surface="translucent"');
    expect(html).toContain('aria-describedby="quick-note-edit-error"');
    expect(html).toContain("field-sizing-fixed");
    expect(html).not.toMatch(/field-sizing-content|resize-y/);
    const tree = session(() => QuickNoteEditor({ editor: { ...editor, draft, conflict: { ...note, output: draft } }, busy: false, controller: null }))();
    const preview = find(tree, "section");
    expect(preview.props.className).toBe("quick-note-editor-conflict");
    expect(block(".quick-note-editor-conflict")).toContain("flex: 0 1 35%");
    expect(preview.props.children).toBeDefined();
    expect(button(find(tree, DialogFooter), "用草稿覆盖最新正文…")).toBeDefined();
    expect(button(tree, "保存正文").props.disabled).toBe(true);
  });

  it("uses shared accessible title/description/close primitives for ordinary headers", () => {
    const tree = QuickNoteDialogHeader({ title: "补写速记", description: "说明", busy: true });
    expect(find(tree, DialogTitle).props.children).toBe("补写速记");
    expect(find(tree, DialogDescription).props.children).toBe("说明");
    const close = find(tree, DialogClose);
    expect(close.props["aria-label"]).toBe("关闭补写速记");
    expect(close.props.disabled).toBe(true);
  });
});

describe("Quick Note editor callbacks and protection", () => {
  it("closes a normalized clean draft, protects changed text on Escape, and resets confirmation after discard", () => {
    const { controller, calls } = controllerMock();
    let current: EditorState | null = editor;
    const render = session(() => QuickNoteEditor({ editor: current, busy: false, controller }));
    find(render(), Dialog).props.onOpenChange?.(false, {} as never);
    expect(calls.cancelEdit).toHaveBeenCalledOnce();
    current = { ...editor, draft: "未保存的草稿" };
    find(render(), Dialog).props.onOpenChange?.(false, {} as never);
    expect(calls.cancelEdit).toHaveBeenCalledOnce();
    expect(find(render(), AlertDialog).props.open).toBe(true);
    find(render(), AlertDialog).props.onOpenChange?.(false, {} as never);
    expect(find(render(), AlertDialog).props.open).toBe(false);
    expect(current.draft).toBe("未保存的草稿");
    button(render(), "取消编辑").props.onClick?.({} as never);
    find(render(), AlertDialogAction).props.onClick?.({} as never);
    expect(calls.cancelEdit).toHaveBeenCalledTimes(2);
    current = null;
    expect(find(render(), Dialog).props.open).toBe(false);
    current = editor;
    expect(find(render(), AlertDialog).props.open).toBe(false);
  });

  it("keeps the editor open and controls disabled during a pending mutation", () => {
    const { controller, calls } = controllerMock();
    const tree = session(() => QuickNoteEditor({ editor: { ...editor, draft: "草稿" }, busy: true, controller }))();
    const dialog = find(tree, Dialog);
    expect(dialog.props.disablePointerDismissal).toBe(true);
    dialog.props.onOpenChange?.(false, {} as never);
    expect(calls.cancelEdit).not.toHaveBeenCalled();
    expect(find(tree, QuickNoteDialogHeader).props.busy).toBe(true);
    expect(button(tree, "取消编辑").props.disabled).toBe(true);
    expect(button(tree, "正在处理…").props.disabled).toBe(true);
  });

  it("forwards draft edits and save/verification without transforming content", () => {
    const { controller, calls } = controllerMock();
    let current = editor;
    const render = session(() => QuickNoteEditor({ editor: current, busy: false, controller }));
    find(render(), QuickNoteEditorFields).props.onChange("[DRIFT:原文]\n新正文\n");
    expect(calls.changeDraft).toHaveBeenCalledWith("[DRIFT:原文]\n新正文\n");
    button(render(), "保存正文").props.onClick?.({} as never);
    expect(calls.saveEditor).toHaveBeenCalledOnce();
    current = { ...editor, uncertain: true };
    expect(button(render(), "保存正文").props.disabled).toBe(true);
    button(render(), "核对保存结果").props.onClick?.({} as never);
    expect(calls.verifyEditor).toHaveBeenCalledOnce();
    expect(calls.saveEditor).toHaveBeenCalledOnce();
  });

  it("requires a separate conflict confirmation before rebasing and saving", () => {
    const { controller, calls } = controllerMock();
    const current = { ...editor, draft: "草稿", conflict: { ...note, output: "最新正文" } };
    const render = session(() => QuickNoteEditor({ editor: current, busy: false, controller }));
    button(render(), "用草稿覆盖最新正文…").props.onClick?.({} as never);
    expect(calls.acceptConflict).not.toHaveBeenCalled();
    expect(calls.saveEditor).not.toHaveBeenCalled();
    expect(find(render(), AlertDialog).props.open).toBe(true);
    find(render(), AlertDialog).props.onOpenChange?.(false, {} as never);
    expect(current.draft).toBe("草稿");
    button(render(), "用草稿覆盖最新正文…").props.onClick?.({} as never);
    find(render(), AlertDialogAction).props.onClick?.({} as never);
    expect(calls.acceptConflict).toHaveBeenCalledOnce();
    expect(calls.saveEditor).toHaveBeenCalledOnce();
    expect(calls.acceptConflict.mock.invocationCallOrder[0]).toBeLessThan(calls.saveEditor.mock.invocationCallOrder[0]);
    expect(find(render(), AlertDialog).props.open).toBe(false);
  });
});

describe("Quick Note form and confirmation callbacks", () => {
  it("retains backfill fields on close/reopen and submits exact configured parameters", () => {
    let open = true;
    const onClose = vi.fn(() => { open = false; });
    const onSubmit = vi.fn();
    const render = session(() => QuickNoteBackfillDialog({ open, config, initialDate: "2026-10-16", disabled: false, onClose, onSubmit }));
    find(render(), QuickNoteDatePicker).props.onChange("2026-10-14");
    find(render(), AppSelect).props.onValueChange("20");
    find(render(), "input").props.onChange?.({ target: { checked: true } } as React.ChangeEvent<HTMLInputElement>);
    find(render(), Dialog).props.onOpenChange?.(false, {} as never);
    expect(onClose).toHaveBeenCalledOnce();
    expect(find(render(), Dialog).props.open).toBe(false);
    open = true;
    expect(find(render(), QuickNoteDatePicker).props.date).toBe("2026-10-14");
    expect(find(render(), AppSelect).props.value).toBe("20");
    expect(find(render(), AppSelect).props.surface).toBe("translucent");
    expect(onSubmit).not.toHaveBeenCalled();
    button(render(), "继续确认重建").props.onClick?.({} as never);
    expect(onSubmit).toHaveBeenCalledWith({ date: "2026-10-14", endHour: 20, periodLabel: "下午", overwrite: true });
  });

  it("keeps retry refresh/close in the footer and retries candidates without overwrite", () => {
    const { controller, calls } = controllerMock();
    const onClose = vi.fn();
    const tree = QuickNoteRetryDialog({ open: true, state, controller, onClose });
    const footer = find(tree, DialogFooter);
    expect(elements(footer).filter((child) => child.type === Button).map((child) => child.props.children)).toEqual(["关闭", "重新读取"]);
    expect(button(footer, "关闭").props.variant).toBe("ghost");
    const refresh = button(footer, "重新读取");
    expect(refresh.props.variant).toBe("default");
    expect(refresh.props.className).toContain("bg-primary/90");
    expect(refresh.props.type).toBe("button");
    refresh.props.onClick?.({} as never);
    expect(calls.loadCandidates).toHaveBeenCalledOnce();
    expect(calls.mutate).not.toHaveBeenCalled();
    button(footer, "关闭").props.onClick?.({} as never);
    expect(onClose).toHaveBeenCalledOnce();
    const list = find(tree, QuickNoteCandidateList);
    const candidate = { key: "k", date: "2026-10-15", endHour: 5, periodLabel: "夜晚", periodStart: 1, periodEnd: 2, status: "missing" as const };
    button(QuickNoteCandidateList({ ...list.props, state: { ...state, candidates: [candidate] } }), "重试该时段").props.onClick?.({} as never);
    expect(calls.mutate).toHaveBeenCalledWith("backfill", "2026-10-15:5", { date: "2026-10-15", endHour: 5, periodLabel: "夜晚", overwrite: false });
    const loading = QuickNoteRetryDialog({ open: true, state: { ...state, candidatesLoading: true }, controller, onClose });
    expect(button(loading, "重新读取").props.disabled).toBe(true);
  });

  it.each(["step1", "step2", "delete", "backfill"] as const)("keeps %s behind AlertDialog confirmation and cancellation", (kind) => {
    const value: QuickNoteConfirmation = kind === "backfill" ? { kind, input: { date: "2026-10-15", endHour: 5, periodLabel: "夜晚", overwrite: true } } : { kind, note };
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const tree = QuickNoteConfirmDialog({ value, onCancel, onConfirm });
    expect(find(tree, AlertDialog).props.open).toBe(true);
    expect(find(tree, AlertDialogContent).props.className).toBe("quick-note-dialog");
    expect(find(tree, AlertDialogHeader)).toBeDefined();
    expect(find(tree, AlertDialogFooter)).toBeDefined();
    expect(find(tree, AlertDialogAction).props.variant).toBe("destructive");
    if (kind === "step1" || kind === "step2") {
      expect(find(tree, AlertDialogTitle).props.children).toBe(kind === "step1" ? "重新整理摘要？" : "重新生成正文？");
      const description = find(tree, AlertDialogDescription).props.children;
      expect(description).toContain(`「${note.periodLabel}」`);
      expect(description).toContain(kind === "step1" ? "清空现有正文" : "替换已保存正文");
    }
    expect(onConfirm).not.toHaveBeenCalled();
    find(tree, AlertDialog).props.onOpenChange?.(false, {} as never);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    find(tree, AlertDialogAction).props.onClick?.({} as never);
    expect(onConfirm).toHaveBeenCalledWith(value);
  });

  it("preserves navigation discard cancellation and explicit confirmation", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const tree = QuickNoteDiscardDialog({ open: true, onCancel, onConfirm });
    find(tree, AlertDialog).props.onOpenChange?.(false, {} as never);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    find(tree, AlertDialogAction).props.onClick?.({} as never);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("routes overwrite backfill and reader reruns through view confirmation before mutations", () => {
    const { controller, calls } = controllerMock();
    vi.spyOn(hooks, "useQuickNotes").mockReturnValue({ state, controller });
    vi.spyOn(hooks, "useQuickNoteLogs").mockReturnValue({ state: { connection: "connecting", entries: [] }, reconnect: vi.fn() });
    vi.spyOn(navigationHooks, "useQuickNoteNavigation").mockReturnValue({ reader: note, overviewRef: React.createRef(), readerRef: React.createRef(), discardAction: null, open: vi.fn(), back: vi.fn(), exit: vi.fn(), cancelDiscard: vi.fn(), confirmDiscard: vi.fn() });
    const render = session(() => QuickNoteView({}));
    const input = { date: "2026-10-15", endHour: 5, periodLabel: "夜晚", overwrite: true };
    find(render(), QuickNoteBackfillDialog).props.onSubmit(input);
    expect(calls.mutate).not.toHaveBeenCalled();
    let confirm = find(render(), QuickNoteConfirmDialog);
    expect(confirm.props.value).toEqual({ kind: "backfill", input });
    confirm.props.onCancel();
    expect(find(render(), QuickNoteConfirmDialog).props.value).toBeNull();
    expect(calls.mutate).not.toHaveBeenCalled();
    find(render(), QuickNoteBackfillDialog).props.onSubmit(input);
    confirm = find(render(), QuickNoteConfirmDialog);
    confirm.props.onConfirm(confirm.props.value!);
    expect(calls.mutate).toHaveBeenLastCalledWith("backfill", "2026-10-15:5", input);
    for (const kind of ["step1", "step2", "delete"] as const) {
      calls.mutate.mockClear();
      find(render(), QuickNoteReader).props.onAction(kind, note);
      expect(calls.mutate).not.toHaveBeenCalled();
      confirm = find(render(), QuickNoteConfirmDialog);
      expect(confirm.props.value).toEqual({ kind, note });
      confirm.props.onConfirm(confirm.props.value!);
      expect(calls.mutate).toHaveBeenCalledWith(kind, note.id);
      expect(find(render(), QuickNoteConfirmDialog).props.value).toBeNull();
    }
  });
});
