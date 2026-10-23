import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialDiaryState } from "@/application/diary-reader/diary-reader-state";
import { diaryDraft, type DiaryEditor as EditorState } from "@/application/diary-reader/diary-actions-state";
import { createDiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { DiaryEditor, DiaryEditList, DiaryDiscardDialog } from "./DiaryEditor";
import { DiaryReader } from "./DiaryReader";
import { DiaryAutoFeed } from "./DiaryAutoFeed";
import { DiaryCalendar } from "./DiaryCalendar";

const entry = { id: "entry", date: "2026-10-09", title: "已保存标题", content: "第一段\n\n正文🦉".repeat(600), tags: ["shared_moment", "未知分类"], keywords: ["关键词\n内部换行", "长词".repeat(200)], importance: 0.6 };
const editor: EditorState = { baseline: entry, draft: diaryDraft(entry), submitted: null, busy: null, uncertain: false, conflict: false, error: null };
function find(node: React.ReactNode, predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return;
  if (predicate(node)) return node;
  for (const child of [...React.Children.toArray(node.props.children as React.ReactNode), node.props.render as React.ReactNode]) { const match = find(child, predicate); if (match) return match; }
}
function callback(node: React.ReactNode, predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean, name = "onClick", value?: unknown) {
  const control = find(node, predicate); expect(control).toBeDefined(); (control!.props[name] as (input?: unknown) => void)(value);
}

describe("Diary direct editing UI", () => {
  it("shows Pencil + Edit directly, with the original Back and no more/info dialog", () => {
    const edit = vi.fn(), back = vi.fn(), tree = DiaryReader({ reader: { entryId: entry.id, date: entry.date, entry, loading: false, error: null }, onBack: back, onRetry: vi.fn(), onEdit: edit });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-label="编辑日记"'); expect(html).toContain("lucide-pencil"); expect(html).toContain(">编辑</button>");
    expect(html).not.toMatch(/查看完整阅读信息|关闭阅读信息|lucide-ellipsis|>阅读信息</);
    expect(html).toContain('aria-label="查看完整标题与分类"');
    callback(tree, (node) => node.props["aria-label"] === "编辑日记"); expect(edit).toHaveBeenCalledOnce();
    callback(tree, (node) => node.type === Button && node.props.onClick === back); expect(back).toHaveBeenCalledOnce();
  });
  it("uses a full editing workspace, keeps actions before the field scroller, and preserves all input", () => {
    const active = createDiaryReaderController(), cancel = vi.fn();
    const save = vi.spyOn(active, "saveEdit").mockResolvedValue(true), change = vi.spyOn(active, "changeDraft");
    const tree = DiaryEditor({ editor, controller: active, onCancel: cancel }), html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-label="日记编辑工作区"'); expect(html).not.toContain('role="dialog"');
    expect(html.indexOf("取消编辑并返回阅读")).toBeLessThan(html.indexOf('data-page-scroll-region="true"'));
    expect(html.indexOf(">保存</button>")).toBeLessThan(html.indexOf('data-page-scroll-region="true"'));
    expect(html).toContain(entry.content); expect(html).toContain("未知分类"); expect(html).toContain("重要度（0–1）");
    expect(html).not.toMatch(/line-clamp|模型选择|自动投喂状态|Entry ID/);
    expect(html).toContain('<time dateTime="2026-10-09">2026-10-09</time>');
    expect(html).not.toMatch(/当前接口无法确认向量处理结果|后端没有版本锁|核对后到写入之间/);
    expect(html).toContain('aria-label="关键词草稿"');
    callback(tree, (node) => node.props["aria-label"] === "取消编辑并返回阅读"); expect(cancel).toHaveBeenCalledOnce();
    callback(tree, (node) => node.type === Button && node.props["aria-busy"] === false); expect(save).toHaveBeenCalledOnce();
    callback(tree, (node) => node.type === Textarea && node.props.id === "diary-edit-content", "onChange", { target: { value: "新的\n正文" } });
    expect(change).toHaveBeenCalledWith({ content: "新的\n正文" });
    callback(tree, (node) => node.type === Input && node.props.id === "diary-edit-importance", "onChange", { target: { value: "0" } });
    expect(change).toHaveBeenCalledWith({ importance: 0 }); active.dispose();
  });
  it("keeps busy/unknown/error drafts visible, disables another save, and exposes GET-only verification", () => {
    const active = createDiaryReaderController(), verify = vi.spyOn(active, "verifyEdit").mockResolvedValue(false);
    const uncertain = { ...editor, uncertain: true, error: "结果未知，保留草稿", submitted: editor.draft };
    const tree = DiaryEditor({ editor: uncertain, controller: active, onCancel: vi.fn() });
    const html = renderToStaticMarkup(tree); expect(html).toContain("结果未知，保留草稿"); expect(html).toContain(entry.content);
    expect(find(tree, (node) => node.type === Button && node.props["aria-busy"] === false)?.props.disabled).toBe(true);
    callback(tree, (node) => node.type === Button && node.props.children === "核对结果"); expect(verify).toHaveBeenCalledOnce();
    const busy = DiaryEditor({ editor: { ...editor, busy: "save" }, controller: active, onCancel: vi.fn() });
    expect(find(busy, (node) => node.props["aria-label"] === "取消编辑并返回阅读")?.props.disabled).toBe(true);
    expect(find(busy, (node) => node.type === Textarea && node.props.id === "diary-edit-content")?.props.disabled).toBe(true); active.dispose();
  });
  it("keeps custom category editing unchanged", () => {
    const change = vi.fn(), values = ["分类\n内部换行", "第二项"];
    const tree = DiaryEditList({ label: "自定义分类", values, disabled: false, onChange: change });
    expect(find(tree, (node) => node.props["aria-label"] === "自定义分类 1")?.props.value).toBe(values[0]);
    callback(tree, (node) => node.props["aria-label"] === "自定义分类 2", "onChange", { target: { value: "修改\n第二项" } });
    expect(change).toHaveBeenCalledWith([values[0], "修改\n第二项"]);
    callback(tree, (node) => node.props["aria-label"] === "移除自定义分类 1"); expect(change).toHaveBeenCalledWith(["第二项"]);
  });
  it("uses shared AlertDialog keep/discard actions, with no discard during saving", () => {
    const keep = vi.fn(), discard = vi.fn(), tree = DiaryDiscardDialog({ open: true, busy: false, onKeep: keep, onDiscard: discard });
    callback(tree, (node) => node.type === AlertDialogCancel); callback(tree, (node) => node.type === AlertDialogAction);
    expect(keep).toHaveBeenCalledOnce(); expect(discard).toHaveBeenCalledOnce();
    const busy = DiaryDiscardDialog({ open: true, busy: true, onKeep: keep, onDiscard: discard });
    expect(find(busy, (node) => node.type === AlertDialogAction)?.props.disabled).toBe(true);
  });
});

describe("Diary compact global automatic feed row", () => {
  it("renders no false Switch state before the first confirmed read", () => {
    const unknown = initialDiaryState().autoFeed;
    const html = renderToStaticMarkup(<DiaryAutoFeed state={{ ...unknown, loading: true }} controller={null} />);
    expect(html).toContain("读取中"); expect(html).not.toContain('role="switch"');
  });
  it("uses the shared Switch and preserves the confirmed value during busy/unknown outcomes", () => {
    const active = createDiaryReaderController(), toggle = vi.spyOn(active, "toggleAutoFeed").mockResolvedValue(true);
    const state = { ...initialDiaryState().autoFeed, enabled: false };
    let tree = DiaryAutoFeed({ state, controller: active });
    callback(tree, (node) => node.type === Switch, "onCheckedChange", true); expect(toggle).toHaveBeenCalledWith(true);
    tree = DiaryAutoFeed({ state: { ...state, saving: true }, controller: active }); expect(find(tree, (node) => node.type === Switch)?.props).toMatchObject({ checked: false, busy: true });
    tree = DiaryAutoFeed({ state: { ...state, uncertain: true }, controller: active }); expect(find(tree, (node) => node.type === Switch)?.props.disabled).toBe(true); active.dispose();
  });
  it("keeps read failures separate from calendar loading and wires explicit status verification", () => {
    const active = createDiaryReaderController(), read = vi.spyOn(active, "loadAutoFeed").mockResolvedValue(true);
    const row = DiaryAutoFeed({ state: { ...initialDiaryState().autoFeed, error: "设置读取失败" }, controller: active });
    callback(row, (node) => node.type === Button && node.props.children === "重新读取设置"); expect(read).toHaveBeenCalledOnce();
    const state = { ...initialDiaryState("2026-10-23"), calendar: { month: "2026-10", items: [] } };
    const html = renderToStaticMarkup(<DiaryCalendar state={state} controller={active} today={state.selectedDate} onOpen={vi.fn()} />);
    expect(html.indexOf("自动投喂记忆")).toBeLessThan(html.indexOf("<table")); expect(html).toContain("这一天还没有日记"); active.dispose();
  });
});
