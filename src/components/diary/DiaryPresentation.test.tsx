import * as React from "react";
import { createRef, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialDiaryState, type DiaryState } from "@/application/diary-reader/diary-reader-state";
import type { DiaryCalendarItem } from "@/domain/diary";
import { createDiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { DiaryCalendar, DiarySelection } from "./DiaryCalendar";
import { DiaryReader } from "./DiaryReader";
import { DiaryView } from "./DiaryView";
import { useDiary } from "./useDiary";
import { useDiaryNavigation } from "./useDiaryNavigation";
import { Button } from "@/components/ui/button";

vi.mock("./useDiary", () => ({ useDiary: vi.fn() }));
vi.mock("./useDiaryNavigation", () => ({ useDiaryNavigation: vi.fn() }));
vi.mock("@/components/ui/toast", async (importOriginal) => ({ ...await importOriginal<typeof import("@/components/ui/toast")>(), useFeedbackToast: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const archived: DiaryCalendarItem = { date: "2026-10-09", entryId: "archive", title: "当天的真实标题", entryStatus: "done", hasDiaryMessages: true, hasSavedContent: true, calendarState: "archived", invalidReason: null };
const pending: DiaryCalendarItem = { ...archived, entryId: "pending", date: "2026-10-10", title: null, entryStatus: "writing", hasSavedContent: false, calendarState: "pending" };
const invalid: DiaryCalendarItem = { ...archived, entryId: "invalid", date: "2026-10-11", title: null, hasSavedContent: false, calendarState: "invalid", invalidReason: "done_without_content" };
const loaded: DiaryState = { ...initialDiaryState("2026-10-09"), calendar: { month: "2026-10", items: [archived, pending, invalid] } };
function controller() { return createDiaryReaderController(undefined, () => "2026-10-09"); }
function renderCalendar(state: DiaryState = loaded, today = "2026-10-23") {
  return renderToStaticMarkup(<DiaryCalendar state={state} controller={controller()} today={today} onOpen={vi.fn()} />);
}
function renderPage(state: DiaryState) {
  vi.mocked(useDiary).mockReturnValue({ state, controller: null, today: "2026-10-23" });
  vi.mocked(useDiaryNavigation).mockReturnValue({ calendarRef: createRef(), readerRef: createRef(), openButtonRef: createRef(), dateButtonRef: createRef(), open: vi.fn(), back: vi.fn() });
  return renderToStaticMarkup(<DiaryView onBack={vi.fn()} />);
}
function find(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return;
  if (predicate(node)) return node;
  for (const child of [...React.Children.toArray(node.props.children as ReactNode), node.props.render as ReactNode, node.props.actions as ReactNode]) {
    const match = find(child, predicate); if (match) return match;
  }
}
function click(element: ReactElement<Record<string, unknown>> | undefined) {
  expect(element).toBeDefined(); (element!.props.onClick as () => void)();
}

describe("Diary calendar UI", () => {
  it("has Monday-first headings, hollow/solid/exception markers and a small legend", () => {
    const html = renderCalendar();
    expect(html).toContain("2026年10月");
    expect(html.indexOf(">一</th>")).toBeLessThan(html.indexOf(">日</th>"));
    for (const state of ["archived", "pending", "invalid"]) expect(html).toContain(`data-diary-marker="${state}"`);
    expect(html).toContain("diary-marker-dot"); expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain("有写作记录"); expect(html).toContain("已归档"); expect(html).toContain("记录异常");
    expect(html.match(/data-diary-date=/g)).toHaveLength(31);
  });
  it.each([archived, pending, invalid])("keeps today, selection and persistence marks independent for $calendarState", (item) => {
    const html = renderCalendar({ ...loaded, selectedDate: item.date }, item.date);
    const button = html.match(new RegExp(`<button[^>]*data-diary-date="${item.date}"[^>]*>[\\s\\S]*?</button>`))?.[0];
    expect(button).toContain('data-selected="true"'); expect(button).toContain('data-today="true"');
    expect(button).toContain('aria-pressed="true"'); expect(button).toContain('aria-current="date"');
    expect(button).toContain(`data-diary-marker="${item.calendarState}"`);
    const todayOnly = renderCalendar({ ...loaded, selectedDate: "2026-10-01" }, item.date).match(new RegExp(`<button[^>]*data-diary-date="${item.date}"[^>]*>`))?.[0];
    expect(todayOnly).toContain('data-today="true"'); expect(todayOnly).not.toContain("data-selected");
  });
  it("keeps selected-background marker contrast and click areas in bounded rows", () => {
    const css = readFileSync(new URL("./diary.css", import.meta.url), "utf8");
    expect(css).toContain("min-height: 52px"); expect(css).not.toMatch(/height:\s*(?:[0-9]+vh|100%)/);
    expect(css).toContain('.diary-day[data-selected="true"] .diary-marker');
    expect(css).toContain('border-color: var(--color-primary-foreground)');
    expect(css).toContain('.diary-marker-dot[data-diary-marker="archived"]');
    expect(css).toContain("var(--glass-surface-strong) 69%, var(--glass-surface) 31%");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
  it("clicking a date selects it, while only the archived preview opens detail", () => {
    const active = controller(), select = vi.spyOn(active, "selectDate"), open = vi.fn();
    const tree = DiaryCalendar({ state: loaded, controller: active, today: "2026-10-23", onOpen: open });
    click(find(tree, (el) => el.type === Button && el.props["data-diary-date"] === "2026-10-10"));
    expect(select).toHaveBeenCalledWith("2026-10-10"); expect(open).not.toHaveBeenCalled();
    const preview = DiarySelection({ date: archived.date, item: archived, known: true, onOpen: open });
    click(find(preview, (el) => el.type === Button)); expect(open).toHaveBeenCalledWith(archived);
    for (const item of [pending, invalid]) expect(find(DiarySelection({ date: item.date, item, known: true, onOpen: open }), (el) => el.type === Button)).toBeUndefined();
  });
  it("wires month arrows and today to controller reads without auto-opening a day", () => {
    const active = controller(), month = vi.spyOn(active, "selectMonth").mockResolvedValue(true), today = vi.spyOn(active, "goToday").mockResolvedValue(true);
    const tree = DiaryCalendar({ state: loaded, controller: active, today: "2026-10-23", onOpen: vi.fn() });
    click(find(tree, (el) => el.type === Button && el.props["aria-label"] === "上个月"));
    click(find(tree, (el) => el.type === Button && el.props["aria-label"] === "下个月"));
    click(find(tree, (el) => el.type === Button && el.props["aria-label"] === "回到今天"));
    expect(month.mock.calls.map(([value]) => value)).toEqual(["2026-09", "2026-11"]); expect(today).toHaveBeenCalledOnce();
    const first = renderCalendar({ ...loaded, month: "0001-01", selectedDate: "0001-01-01", calendar: { month: "0001-01", items: [] } });
    expect(first.match(/<button[^>]*aria-label="上个月"[^>]*>/)?.[0]).toContain("disabled");
    const last = renderCalendar({ ...loaded, month: "9999-12", selectedDate: "9999-12-31", calendar: { month: "9999-12", items: [] } });
    expect(last.match(/<button[^>]*aria-label="下个月"[^>]*>/)?.[0]).toContain("disabled");
  });
  it("distinguishes saved drafts, persisted messages, no record and invalid entries without fake actions", () => {
    expect(renderCalendar({ ...loaded, selectedDate: pending.date })).toContain("有日记会话记录，尚未归档。");
    const draft = renderCalendar({ ...loaded, selectedDate: pending.date, calendar: { month: "2026-10", items: [{ ...pending, hasSavedContent: true }] } });
    expect(draft).toContain("有保存的正文草稿，尚未归档。");
    expect(draft).not.toMatch(/继续对话|提取正文|重新生成|阅读全文|生成完成/);
    const empty = renderCalendar({ ...loaded, selectedDate: "2026-10-12" });
    expect(empty).toContain("这一天还没有日记。");
    expect(empty.match(/<button[^>]*data-diary-date="2026-10-12"[^>]*>[\s\S]*?<\/button>/)?.[0]).not.toContain("data-diary-marker");
    const bad = renderCalendar({ ...loaded, selectedDate: invalid.date });
    expect(bad).toContain("日记记录状态异常"); expect(bad).toContain("没有有效的已保存正文");
  });
  it("does not hide malformed-date records or expose raw technical diagnostics", () => {
    const html = renderCalendar({ ...loaded, calendar: { month: "2026-10", items: [{ ...invalid, date: "2026-10-02junk", invalidReason: "invalid_business_date" }] } });
    expect(html).toContain('aria-label="日期异常记录"'); expect(html).toContain("2026-10-02junk");
    expect(html).toContain("无法对应到日历"); expect(html).not.toContain("invalid_business_date");
  });
  it("shows loading/read errors and explicitly identifies failed refresh with retained data", () => {
    const loading = renderCalendar({ ...loaded, calendar: null, calendarLoading: true });
    expect(loading).toContain("正在读取日历"); expect(loading).not.toContain("这一天还没有日记");
    const failed = renderCalendar({ ...loaded, calendar: null, calendarError: "网络连接中断，请重试。" });
    expect(failed).toContain('role="alert"'); expect(failed).toContain("重新读取日历"); expect(failed).not.toContain("这一天还没有日记");
    const stale = renderCalendar({ ...loaded, calendarError: "网络连接中断，请重试。" });
    expect(stale).toContain("刷新未成功，以下保留上次读取的索引"); expect(stale).toContain("当天的真实标题");
  });
});

describe("Diary full-text reader and page", () => {
  const reader = { entryId: "archive", date: "2026-10-09", entry: { id: "archive", date: "2026-10-09", title: "真实标题", content: "第一段\n\n第二段" }, loading: false, error: null };
  it("uses one independent scroll owner, fixed return/date and complete escaped plain text", () => {
    const content = "**原样保留**\n\n<script>example</script>\n" + "长正文\n".repeat(350) + "english".repeat(600) + "末尾";
    const html = renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry: { ...reader.entry, content } }} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html.indexOf("返回日历")).toBeLessThan(html.indexOf('data-page-scroll-region="true"'));
    expect(html.indexOf('datetime="2026-10-09"')).toBeLessThan(html.indexOf('data-page-scroll-region="true"'));
    expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
    expect(html).toContain("**原样保留**\n\n&lt;script&gt;example&lt;/script&gt;");
    expect(html).toContain("末尾"); expect(html).toContain("[overflow-wrap:anywhere]"); expect(html).toContain("whitespace-pre-wrap");
    expect(html).not.toMatch(/<script|<strong|<img|line-clamp|truncate|<textarea|编辑|下一篇/);
  });
  it.each([null, "", " \n "])("uses a display-only untitled fallback: %s", (title) => {
    expect(renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry: { ...reader.entry, title } }} onBack={vi.fn()} onRetry={vi.fn()} />)).toContain("无标题");
  });
  it("does not label failed or unverified detail as archived and keeps retry/back working", () => {
    const back = vi.fn(), retry = vi.fn();
    const tree = DiaryReader({ reader: { ...reader, entry: null, error: "这篇日记已不存在，或尚无有效的归档正文。" }, onBack: back, onRetry: retry });
    const html = renderToStaticMarkup(tree);
    expect(html).not.toContain("已归档"); expect(html).not.toContain("data-diary-content");
    expect(html).toContain("重新读取正文"); click(find(tree, (el) => el.type === Button)); expect(back).toHaveBeenCalledOnce();
    const stale = renderToStaticMarkup(<DiaryReader reader={{ ...reader, error: "网络连接中断，请重试。" }} onBack={back} onRetry={retry} />);
    expect(stale).toContain("以下保留上次读取的正文"); expect(stale).toContain("第一段\n\n第二段");
  });
  it("keeps the shared PageHeader fixed and calendar mounted while reading", () => {
    const html = renderPage({ ...loaded, reader });
    expect(html).toContain('aria-labelledby="diary-page-title"'); expect(html).toContain('id="diary-page-title"');
    expect(html).toContain("DIARY"); expect(html).toContain('aria-label="刷新正文"'); expect(html).toContain('aria-label="返回桌面"');
    expect(html).toMatch(/<div hidden=""[^>]*data-page-scroll-area/);
    expect(html).toContain('aria-label="单篇日记阅读"'); expect(html).toContain("max-h-dvh");
    const overview = renderPage(loaded);
    expect(overview).toContain('aria-label="刷新日历"'); expect(overview).not.toContain('aria-label="单篇日记阅读"');
  });
  it("keeps retry and refresh controls tied to read operations", () => {
    const active = controller(), refresh = vi.spyOn(active, "refresh").mockResolvedValue(true);
    vi.mocked(useDiary).mockReturnValue({ state: loaded, controller: active, today: "2026-10-23" });
    vi.mocked(useDiaryNavigation).mockReturnValue({ calendarRef: createRef(), readerRef: createRef(), openButtonRef: createRef(), dateButtonRef: createRef(), open: vi.fn(), back: vi.fn() });
    const tree = DiaryView({});
    click(find(tree, (el) => el.props["aria-label"] === "刷新日历")); expect(refresh).toHaveBeenCalledOnce();
    expect(renderPage(loaded)).not.toMatch(/自动投喂|保存日记|继续写|封面|摘要|Chat/);
  });
});
