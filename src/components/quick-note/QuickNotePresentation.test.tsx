import { readFileSync } from "node:fs";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuickNote, TriggerConfig } from "@/domain/quick-note";
import { INITIAL_QUICK_NOTE_STATE, type QuickNoteState } from "@/application/quick-note/quick-note-state";
import { QuickNoteConfig, QuickNoteView } from "./QuickNoteView";
import { QuickNoteOverview } from "./QuickNoteOverview";
import { QuickNoteActions, QuickNoteReader, QuickNoteTopButton } from "./QuickNoteReader";
import { QuickNoteOutput, QuickNoteSummary } from "./QuickNoteSection";
import { QuickNoteCandidateList, confirmationCopy } from "./QuickNoteDialogs";
import { QuickNoteEditorFields } from "./QuickNoteEditor";
import { QuickNoteLogs } from "./QuickNoteLogs";
import { QuickNoteDateNavigation } from "./QuickNoteControls";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as hooks from "./useQuickNotes";
import * as navigationHooks from "./useQuickNoteNavigation";

const config: TriggerConfig = { hours: [5, 13, 20], labels: { "5": "夜晚", "13": "上午", "20": "下午" }, dayBoundaryHour: 5, timeZone: "Asia/Shanghai" };
const note: QuickNote = { id: "qn_1", periodStart: Date.parse("2026-10-16T12:00:00Z") / 1000, periodEnd: Date.parse("2026-10-16T21:00:00Z") / 1000, periodLabel: "保存时的名称", summary: '{"事件归纳":"事件内容","关键对话":[{"time":"09:00","content":["句1","句2"]}]}', output: "[DRIFT:保留]\n正文<br>[HEART:保留]", createdAt: 1792130000 };
const loaded: QuickNoteState = { ...INITIAL_QUICK_NOTE_STATE, configLoading: false, config, date: "2026-10-16", status: "success", data: { items: [note] } };
const render = (state: QuickNoteState) => renderToStaticMarkup(<TooltipProvider><QuickNoteOverview state={state} controller={null} onOpen={vi.fn()} /></TooltipProvider>);
const renderReader = (value: QuickNote | null = note, state = loaded) => renderToStaticMarkup(<QuickNoteReader note={value} timeZone={config.timeZone} state={state} controller={null} onBack={vi.fn()} onAction={vi.fn()} />);
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
    expect(render({ ...loaded, data: { items: [] } })).toContain("这一天还没有留下速记");
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
    const html = renderReader();
    expect(html).toContain("保存时的名称");
    expect(html).toContain("2026-10-17（跨天） 05:00");
    expect(html).toContain('data-quick-note-fragment="DRIFT"');
    expect(html).toContain('data-quick-note-fragment="HEART"');
    expect(html).toContain("正文");
    expect(html).toContain('data-quick-note-summary-kind="events"');
    expect(html).toContain('data-quick-note-summary-kind="dialogue"');
    expect(html).toContain("事件内容");
    expect(html).toContain("time</dt>");
    expect(html).toContain("09:00");
    expect(html).toContain("句1");
    expect(html).toContain("句2");
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html.indexOf('data-quick-note-output="true"')).toBeLessThan(html.indexOf("<details"));
    expect(html).not.toContain("收起正文");
    expect(html).not.toMatch(/max-h-|line-clamp/);
    expect((html.match(/overflow-y-auto/g) ?? []).length).toBe(1);
    expect(html).toContain("返回日期概览");
    expect(html).toContain('aria-label="本篇速记操作"');
    expect(html).not.toContain("速记分页");
  });
  it("renders all wired actions with accessible names and distinct rerun semantics", () => {
    const html = renderToStaticMarkup(<QuickNoteActions note={note} disabled={false} onAction={vi.fn()} />);
    expect(html).toContain("Step 1 重跑辅助模型（清空正文）");
    expect(html).toContain("Step 2 重跑主模型（重新生成正文）");
    expect(html).toContain('aria-label="保存时的名称：编辑正文"');
    expect(html).toContain('aria-label="保存时的名称：删除速记"');
    expect(html).not.toMatch(/[🧠✏️🗑️🔄]/u);
    expect(render({ ...loaded, pending: { kind: "step2", target: note.id } })).toContain("正在请求 Step 2");
  });
  it("labels empty output as saved absence, including whitespace, without inventing generation state", () => {
    for (const output of ["", " \n "]) {
      const html = renderToStaticMarkup(<QuickNoteOutput output={output} />);
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
    expect(html).not.toContain("连接状态仅表示日志通道");
    expect(html).toContain("[success]");
    expect(html).toMatch(/<time[^>]*title="2026\/10\/16 20:00:00"[^>]*>20:00:00<\/time>/);
    expect(html).toContain('data-quick-note-log-tone="success"');
    expect(html).toContain("text-success-foreground");
    expect(html).toContain("Step 2 完成 ✓\n原始日志");
    expect(html).not.toContain("运行中");
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain("max-h-64 overflow-y-auto");
    expect(html.indexOf("[success]")).toBeGreaterThan(html.indexOf("</summary>"));
    const failed = renderToStaticMarkup(<QuickNoteLogs state={{ connection: "reconnecting", entries: [] }} onReconnect={vi.fn()} />);
    expect(failed).toContain("正在重连");
    expect(failed).toContain("重新连接日志");
    expect(failed.indexOf("重新连接日志")).toBeGreaterThan(failed.indexOf("</details>"));
  });
  it("keeps four 44px date controls on one grid row without exposing configuration", () => {
    const html = renderToStaticMarkup(<QuickNoteDateNavigation config={config} date="2000-01-01" onChange={vi.fn()} />);
    expect(html).toContain('aria-label="速记日期"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("Asia/Shanghai");
    expect(html).not.toContain("日界");
    expect(html).not.toContain("2000-01-01");
    expect(html).toContain("grid-cols-4");
    expect(html).not.toMatch(/flex-wrap|overflow-x-auto|type="date"/);
    expect((html.match(/<button\b/g) ?? []).length).toBe(4);
    expect((html.match(/h-11 min-w-11 w-full/g) ?? []).length).toBe(4);
  });

  it("uses saved previews only, with no summary/actions or configured empty periods", () => {
    const html = render(loaded);
    expect(html).toContain("line-clamp-3");
    expect(html).toContain('data-quick-note-preview="true"');
    expect(html).toContain("[DRIFT:保留]\n正文\n[HEART:保留]");
    expect(html).toContain("20:00–05:00（次日）");
    expect(html).not.toContain("速记分页");
    expect(html).not.toContain("上一页");
    expect(html).not.toContain("下一页");
    expect(html).not.toContain("共 21 条");
    expect(html).not.toContain("按创建时间倒序");
    expect(html).not.toContain("data-quick-note-output");
    expect(html).not.toContain("事件内容");
    expect(html).not.toContain("Step 1");
    expect(html).not.toContain("编辑正文");
    expect(html).not.toContain("下午");
    expect(html).not.toContain("上午");
    const records = [{ ...note, id: "newer", periodLabel: "较新的夜晚" }, { ...note, id: "older", periodLabel: "较早的上午", output: "" }];
    const ordered = render({ ...loaded, data: { ...loaded.data!, items: records } });
    expect(ordered.indexOf('data-quick-note-open="newer"')).toBeLessThan(ordered.indexOf('data-quick-note-open="older"'));
    expect(ordered).toContain("尚无已保存正文");
    expect(ordered).not.toContain("生成中");
    expect(renderReader(null)).toContain("这一天已不包含这条速记");
  });

  it("keeps complete long output in the reader and tolerates structured/legacy summary values", () => {
    const output = Array.from({ length: 120 }, (_, index) => `第${index}行正文`).join("\n");
    const html = renderReader({ ...note, output });
    expect(html).toContain(output);
    const summary = renderToStaticMarkup(<QuickNoteSummary summary={JSON.stringify({ "事件归纳": [{ "时间段": "05:00–13:00", "原文": "<b>原话</b>", "归纳说明": "完整说明" }], "关键对话": [{ "对话": ["旧句1", "旧句2"], extra: { flag: true, value: null } }] })} />);
    expect(summary).toContain("&lt;b&gt;原话&lt;/b&gt;");
    for (const text of ["事件归纳", "关键对话", "时间段", "05:00–13:00", "归纳说明", "完整说明", "旧句1", "旧句2", "extra", "true", "null"]) expect(summary).toContain(text);
    expect(summary).toContain("<dl");
    expect(summary).toContain("<ol");
    expect(summary).not.toMatch(/overflow-y|max-h|<details[^>]*open/);
    for (const raw of ["null", '["旧摘要",{"未知":42}]', '"旧格式"', "{异常", ""]) expect(() => renderToStaticMarkup(<QuickNoteSummary summary={raw} />)).not.toThrow();
  });

  it("keeps empty logs compact and configuration read-only behind native disclosure", () => {
    const logs = renderToStaticMarkup(<QuickNoteLogs state={{ connection: "connected", entries: [] }} onReconnect={vi.fn()} />);
    expect(logs).toContain("暂无日志");
    const summary = logs.slice(0, logs.indexOf("</summary>"));
    expect(summary).toContain("运行日志");
    expect(summary).not.toContain("重新读取日志");
    expect(summary).not.toContain("日志已连接");
    const configuration = renderToStaticMarkup(<QuickNoteConfig config={config} loading={false} onReload={vi.fn()} />);
    expect(configuration).toContain("Asia/Shanghai");
    expect(configuration).toContain("05:00");
    expect(configuration).not.toContain("当前为只读配置入口");
    expect(configuration).not.toMatch(/<details[^>]*open|<input/);
  });

  it("reuses Memory material values locally and avoids white nested reading surfaces", () => {
    const css = readFileSync(new URL("./quick-note.css", import.meta.url), "utf8");
    expect(css).toContain("var(--glass-surface-strong) 69%, var(--glass-surface) 31%");
    expect(css).toMatch(/\.quick-note-overview,\s*\.quick-note-reader\s*\{/);
    expect(css).not.toContain("--mist-solid-surface");
    expect(render(loaded)).toContain("quick-note-overview mist-glass-strong");
    expect(renderReader()).toContain("quick-note-reader mist-glass-strong");
    expect(renderReader()).not.toContain("mist-solid");
  });

  it("keeps the overview mounted and reads current saved content after edit/rerun/deletion", () => {
    vi.spyOn(navigationHooks, "useQuickNoteNavigation").mockReturnValue({
      reader: note, overviewRef: createRef<HTMLDivElement>(), readerRef: createRef<HTMLDivElement>(),
      discardAction: null, open: vi.fn(), back: vi.fn(), exit: vi.fn(), cancelDiscard: vi.fn(), confirmDiscard: vi.fn(),
    });
    const source = vi.spyOn(hooks, "useQuickNotes");
    source.mockReturnValue({ state: { ...loaded, data: { ...loaded.data!, items: [{ ...note, output: "保存后完整正文\n最新一行" }] } }, controller: null });
    const saved = renderToStaticMarkup(<QuickNoteView />);
    expect(saved).toContain('hidden=""');
    expect(saved).toContain("保存后完整正文\n最新一行");
    expect(saved).toContain('data-quick-note-output="true"');
    expect(saved).not.toContain("[DRIFT:保留]");
    source.mockReturnValue({ state: { ...loaded, data: { ...loaded.data!, items: [{ ...note, output: "" }] } }, controller: null });
    expect(renderToStaticMarkup(<QuickNoteView />)).toContain("尚无已保存正文");
    source.mockReturnValue({ state: { ...loaded, data: { ...loaded.data!, items: [] } }, controller: null });
    const removed = renderToStaticMarkup(<QuickNoteView />);
    expect(removed).toContain("这一天已不包含这条速记");
    expect(removed).not.toContain('data-quick-note-output="true"');
  });

  it("keeps reader navigation and metadata outside the single body/summary scroll region", () => {
    const html = renderReader();
    const endHeader = html.indexOf("</header>");
    const scrollRegion = html.indexOf('data-quick-note-reader-scroll="true"');
    const header = html.slice(0, endHeader);
    expect(header).toContain("shrink-0");
    expect(header).toContain("返回日期概览");
    expect(header).toContain("2026-10-17（跨天） 05:00");
    expect(scrollRegion).toBeGreaterThan(endHeader);
    expect(html.indexOf('data-quick-note-output="true"')).toBeGreaterThan(scrollRegion);
    expect(html.indexOf('data-quick-note-summary="true"')).toBeGreaterThan(scrollRegion);
    expect(html).toContain('aria-label="速记正文与摘要" tabindex="0"');
    const source = readFileSync(new URL("./QuickNoteView.tsx", import.meta.url), "utf8");
    const wrapper = source.match(/<div ref=\{navigation.readerRef\}[^>]*>/)?.[0];
    expect(wrapper).toContain("flex min-h-0 flex-1 flex-col overflow-hidden");
    expect(source).toContain("max-h-dvh");
  });

  it("keeps local font hierarchy compact and the floating top button accessible", () => {
    const overview = render(loaded);
    expect(overview).toContain('class="text-base font-semibold"');
    expect(overview).toContain("text-[13px] leading-6");
    const reader = renderReader();
    expect(reader).toContain("text-[15px] leading-7");
    expect(reader).toContain("text-[13px] leading-6");
    expect(renderToStaticMarkup(<QuickNoteTopButton visible={false} onClick={vi.fn()} />)).toBe("");
    const button = renderToStaticMarkup(<QuickNoteTopButton visible onClick={vi.fn()} />);
    expect(button).toContain('aria-label="回到正文顶部"');
    expect(button).toContain("mist-glass");
    expect(button).toContain("absolute bottom-3 right-3 size-11");
  });

  it("keeps long semantic prose and dialogue disclosures inside the existing reader scroll region", () => {
    const dialogue = Array.from({ length: 300 }, (_, index) => `我：第${index}句完整原文`).join("\n");
    const html = renderReader({ ...note, output: "前文\n[HEART:片段]\n" + "长正文\n".repeat(300) + "[DRIFT:末尾片段]", summary: JSON.stringify({ "事件归纳": "已保存事件", "关键对话": { time: "20:24–20:34", content: dialogue } }) });
    expect((html.match(/overflow-y-auto/g) ?? []).length).toBe(1);
    expect((html.match(/<details\b/g) ?? []).length).toBe(2);
    expect(html).toContain("第299句完整原文");
    expect(html).toContain("末尾片段");
    expect(html).toContain("收起关键对话");
    expect(html).not.toMatch(/max-h-|line-clamp/);
  });
});
