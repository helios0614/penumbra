import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuickNote, TriggerConfig } from "@/domain/quick-note";
import { INITIAL_QUICK_NOTE_STATE, type QuickNoteState } from "@/application/quick-note/quick-note-state";
import { QuickNoteReadingSurface, QuickNoteView } from "./QuickNoteView";
import { QuickNoteSection, QuickNoteSummary } from "./QuickNoteSection";
import { QuickNoteCandidateList, confirmationCopy } from "./QuickNoteDialogs";
import { QuickNoteEditorFields } from "./QuickNoteEditor";
import { QuickNoteLogs } from "./QuickNoteLogs";
import { QuickNoteDateNavigation } from "./QuickNoteControls";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as hooks from "./useQuickNotes";

const config: TriggerConfig = { hours: [5, 13, 20], labels: { "5": "夜晚", "13": "上午", "20": "下午" }, dayBoundaryHour: 5, timeZone: "Asia/Shanghai" };
const note: QuickNote = { id: "qn_1", periodStart: Date.parse("2026-10-16T12:00:00Z") / 1000, periodEnd: Date.parse("2026-10-16T21:00:00Z") / 1000, periodLabel: "保存时的名称", summary: '{"事件归纳":"事件内容","关键对话":[{"time":"09:00","content":["句1","句2"]}]}', output: "[DRIFT:保留]\n正文<br>[HEART:保留]", createdAt: 1792130000 };
const loaded: QuickNoteState = { ...INITIAL_QUICK_NOTE_STATE, configLoading: false, config, date: "2026-10-16", status: "success", data: { items: [note], page: 1, pageSize: 10, total: 21, hasMore: true } };
const render = (state: QuickNoteState) => renderToStaticMarkup(<TooltipProvider><QuickNoteReadingSurface state={state} controller={null} onAction={vi.fn()} /></TooltipProvider>);
afterEach(() => vi.restoreAllMocks());

describe("Quick Note page presentation", () => {
  it("reuses the required PageHeader contract, wording, and 44px actions", () => {
    const html = renderToStaticMarkup(<QuickNoteView onBack={vi.fn()} />);
    expect(html).toContain('aria-labelledby="quick-note-page-title"');
    expect(html).toContain('id="quick-note-page-title"');
    expect(html).toContain("QUICK NOTES");
    expect(html).toContain("那些散落的时段，会被整理成可以回看的记录。");
    expect(html).toContain('aria-label="重试近期未完成时段"');
    expect(html).toContain('aria-label="更多速记操作"');
    expect(html).toContain('aria-label="返回桌面"');
    expect(html).toContain("size-11");
    expect(html).toContain("正在读取时段与日期配置");
  });
  it("renders loading, empty, and recoverable read errors inside one reading surface", () => {
    expect(render({ ...loaded, status: "loading", data: null })).toContain("正在读取速记");
    expect(render({ ...loaded, data: { ...loaded.data!, items: [], total: 0, hasMore: false } })).toContain("这个业务日期还没有速记记录");
    const error = render({ ...loaded, status: "error", error: "读取失败", data: null });
    expect(error).toContain('role="alert"');
    expect(error).toContain("重新读取记录");
    expect(error).not.toContain("开始生成");
  });
  it("shows configuration failures with a recovery entry and no assumed date controls", () => {
    vi.spyOn(hooks, "useQuickNotes").mockReturnValue({ state: { ...INITIAL_QUICK_NOTE_STATE, configLoading: false, configError: "时区配置不可用" }, controller: null });
    const html = renderToStaticMarkup(<QuickNoteView onBack={vi.fn()} />);
    expect(html).toContain("时区配置不可用");
    expect(html).toContain("重新读取配置");
    expect(html).not.toContain('aria-label="速记日期"');
    expect(html).not.toContain("04:00");
  });
  it("shows real historical labels, cross-day times, complete output and independent summary", () => {
    const html = render(loaded);
    expect(html).toContain("保存时的名称");
    expect(html).toContain("2026-10-17（跨天） 05:00");
    expect(html).toContain("[DRIFT:保留]\n正文\n[HEART:保留]");
    expect(html).toContain("对话摘要（辅助整理 · Step 1）");
    expect(html).toContain("事件内容");
    expect(html).toContain("time：09:00");
    expect(html).not.toMatch(/<details[^>]*open/);
    const afterSummary = html.slice(html.indexOf("</details>") + "</details>".length);
    expect(afterSummary).toContain('data-quick-note-output="true"');
    expect(afterSummary).not.toContain("收起正文");
    expect(html).toContain("第 1 / 3 页，共 21 条");
    expect(html).toContain("按创建时间倒序");
  });
  it("renders all wired actions with accessible names and distinct rerun semantics", () => {
    const html = render(loaded);
    expect(html).toContain("Step 1 重跑辅助模型（清空正文）");
    expect(html).toContain("Step 2 重跑主模型（重新生成正文）");
    expect(html).toContain('aria-label="保存时的名称：编辑正文"');
    expect(html).toContain('aria-label="保存时的名称：删除速记"');
    expect(html).not.toMatch(/[🧠✏️🗑️🔄]/u);
    expect(render({ ...loaded, pending: { kind: "step2", target: note.id } })).toContain("正在请求 Step 2");
  });
  it("labels empty output as saved absence, including whitespace, without inventing generation state", () => {
    for (const output of ["", " \n "]) {
      const html = renderToStaticMarkup(<TooltipProvider><QuickNoteSection note={{ ...note, output }} timeZone={config.timeZone} disabled={false} onAction={vi.fn()} /></TooltipProvider>);
      expect(html).toContain("尚无已保存正文");
      expect(html).not.toContain("生成中");
    }
  });
  it("escapes legacy/malformed summary and output HTML without losing content", () => {
    const html = renderToStaticMarkup(<QuickNoteSummary summary={'<img src=x onerror="alert(1)">非法 JSON'} />);
    expect(html).toContain("原始摘要（非 JSON）");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(render({ ...loaded, data: { ...loaded.data!, items: [{ ...note, output: "<script>evil()</script>" }] } })).toContain("&lt;script&gt;");
  });
  it("keeps accepted/uncertain mutation feedback and errors visible alongside saved records", () => {
    const html = render({ ...loaded, notice: { tone: "error", text: "操作结果暂时无法确认，请重新读取核对" } });
    expect(html).toContain("操作结果暂时无法确认");
    expect(html).toContain("[HEART:保留]");
    expect(html).toContain("刷新记录");
  });
  it("renders candidate loading, empty and error recovery without a fake retry", () => {
    const candidate = (state: QuickNoteState) => renderToStaticMarkup(<QuickNoteCandidateList state={state} onRefresh={vi.fn()} onRetry={vi.fn()} />);
    expect(candidate({ ...loaded, candidatesLoading: true })).toContain("正在读取近期未完成时段");
    expect(candidate({ ...loaded, candidates: [] })).toContain("近期没有可重试");
    const error = candidate({ ...loaded, candidatesError: "读取失败" });
    expect(error).toContain('role="alert"');
    expect(error).toContain("重新读取候选");
    expect(error).not.toContain("重试该时段");
    expect(candidate({ ...loaded, candidates: [{ key: "k", date: "2026-10-16", periodLabel: "夜晚", periodStart: note.periodStart, periodEnd: note.periodEnd, endHour: 5, status: "missing" }] })).toContain("重试该时段");
  });
  it("preserves failed edit input in the textarea with an accessible inline error", () => {
    const html = renderToStaticMarkup(<QuickNoteEditorFields editor={{ baseline: note, draft: "失败后保留\n完整草稿", error: "保存失败", conflict: null, uncertain: false }} busy={false} onChange={vi.fn()} />);
    expect(html).toContain("失败后保留\n完整草稿");
    expect(html).toContain('aria-describedby="quick-note-edit-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("保存失败");
  });
  it("provides explicit destructive confirmations for Step 1, Step 2, deletion and overwrite", () => {
    expect(confirmationCopy({ kind: "step1", note }).description).toContain("清空现有正文");
    expect(confirmationCopy({ kind: "step2", note }).description).toContain("替换已保存正文");
    expect(confirmationCopy({ kind: "delete", note }).description).toContain("不可撤销");
    expect(confirmationCopy({ kind: "backfill", input: { date: "2026-10-16", periodLabel: "夜晚", endHour: 5, overwrite: true } }).description).toContain("显式覆盖");
  });
  it("separates log connection from task state and preserves level, timestamp, Step text", () => {
    const html = renderToStaticMarkup(<QuickNoteLogs state={{ connection: "connected", entries: [{ seq: 1, ts: note.periodStart, level: "success", message: "Step 2 完成 ✓\n原始日志" }] }} timeZone={config.timeZone} onReconnect={vi.fn()} />);
    expect(html).toContain("日志已连接");
    expect(html).toContain("连接状态仅表示日志通道");
    expect(html).toContain("[success]");
    expect(html).toContain("2026/10/16 20:00:00");
    expect(html).toContain("Step 2 完成 ✓\n原始日志");
    expect(html).not.toContain("运行中");
    expect(html).not.toMatch(/<details[^>]*open/);
    const failed = renderToStaticMarkup(<QuickNoteLogs state={{ connection: "reconnecting", entries: [] }} onReconnect={vi.fn()} />);
    expect(failed).toContain("正在重连");
    expect(failed).toContain("重新读取日志");
  });
  it("marks date selection and exposes the configured timezone and boundary", () => {
    const html = renderToStaticMarkup(<QuickNoteDateNavigation config={config} date="2000-01-01" onChange={vi.fn()} />);
    expect(html).toContain('aria-label="速记日期"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Asia/Shanghai");
    expect(html).toContain("05:00 日界");
    expect(html).toContain("2000-01-01");
  });
});
