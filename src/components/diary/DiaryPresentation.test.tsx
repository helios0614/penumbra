import * as React from "react";
import { createRef, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialDiaryState, type DiaryState } from "@/application/diary-reader/diary-reader-state";
import type { DiaryCalendarItem } from "@/domain/diary";
import { parseArchivedDiary } from "@/domain/diary/diary-mappers";
import { createDiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { DiaryCalendar, DiarySelection } from "./DiaryCalendar";
import { DiaryReader, diaryReaderImportance } from "./DiaryReader";
import { DiaryReaderHeading, DiaryReaderTags } from "./DiaryReaderDetails";
import { DiaryView } from "./DiaryView";
import { useDiary } from "./useDiary";
import { useDiaryNavigation } from "./useDiaryNavigation";
import { Button } from "@/components/ui/button";

vi.mock("./useDiary", () => ({ useDiary: vi.fn() }));
vi.mock("./useDiaryNavigation", () => ({ useDiaryNavigation: vi.fn() }));
vi.mock("./useDiaryFeed", () => ({ useDiaryFeed: () => ({ state: { busyDate: null, notices: {} }, controller: null }) }));
vi.mock("./useDiaryChatNavigation", () => ({ useDiaryChatNavigation: () => ({ entryId: null, open: vi.fn(), back: vi.fn() }) }));
vi.mock("./useDiaryEditorNavigation", () => ({ useDiaryEditorNavigation: () => ({ editorRef: { current: null }, editButtonRef: { current: null }, discard: null, cancel: vi.fn(), exit: vi.fn(), keep: vi.fn(), confirm: vi.fn() }) }));
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
    expect(css).toContain("min-height: 48px"); expect(css).not.toMatch(/height:\s*(?:[0-9]+vh|100%)/);
    expect(css).toContain(".diary-calendar-table { height: auto;");
    expect(css).toMatch(/\.diary-day-marker\s*\{\s*position: absolute;/);
    expect(css).toContain("top: calc(100% + 3px)");
    expect(css).toContain('.diary-day[data-selected="true"] .diary-marker');
    expect(css).toContain('border-color: var(--color-primary-foreground)');
    expect(css).toContain('.diary-marker-dot[data-diary-marker="archived"]');
    expect(css).toContain("var(--glass-surface-strong) 69%, var(--glass-surface) 31%");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
  it.each([["2026-10", 5, 31], ["2026-11", 6, 30]] as const)("renders the natural %s month without padding to six weeks", (month, weeks, days) => {
    const html = renderCalendar({ ...loaded, month, selectedDate: `${month}-23`, calendar: { month, items: [] } });
    expect(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr>/g)).toHaveLength(weeks);
    expect(html.match(/data-diary-date=/g)).toHaveLength(days);
    expect(html).not.toContain("diary-day-marker");
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
    expect(empty).toContain("日历中尚无这一天的记录。");
    expect(empty.match(/<button[^>]*data-diary-date="2026-10-12"[^>]*>[\s\S]*?<\/button>/)?.[0]).not.toContain("data-diary-marker");
    const bad = renderCalendar({ ...loaded, selectedDate: invalid.date });
    expect(bad).toContain("日记记录状态异常"); expect(bad).toContain("没有有效的已保存正文");
  });
  it("does not hide malformed-date records or expose raw technical diagnostics", () => {
    const html = renderCalendar({ ...loaded, calendar: { month: "2026-10", items: [{ ...invalid, date: "2026-10-02junk", invalidReason: "invalid_business_date" }] } });
    expect(html).toContain('aria-label="日期异常记录"'); expect(html).toContain("2026-10-02junk");
    expect(html).toContain("无法对应到日历"); expect(html).not.toContain("invalid_business_date");
  });
  it("uses one accessible archived card button with a saved excerpt and no nested controls", () => {
    const content = "真实正文开头 <script>纯文本</script>\n第二行\n" + "猫🐈".repeat(150);
    const preview = { entryId: archived.entryId, date: archived.date, entry: { id: archived.entryId, date: archived.date, title: "详情中的标题", content, importance: null, tags: [], keywords: [] }, loading: false, error: null };
    const html = renderToStaticMarkup(<DiarySelection date={archived.date} item={archived} known preview={preview} onOpen={vi.fn()} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('aria-label="阅读全文：详情中的标题，2026年10月9日"');
    expect(html).toContain('type="button"'); expect(html).toContain("lucide-chevron-right");
    expect(html).toContain("真实正文开头 &lt;script&gt;纯文本&lt;/script&gt;");
    expect(html).toContain('data-diary-excerpt="true"'); expect(html).toContain("line-clamp-2");
    expect(html).not.toContain(content); expect(html).not.toMatch(/<a\b|<h3|<p\b|soft-primary|>阅读全文</);
    const wrong = renderToStaticMarkup(<DiarySelection date={archived.date} item={archived} known preview={{ ...preview, date: "2026-10-12" }} onOpen={vi.fn()} />);
    expect(wrong).not.toContain("真实正文开头"); expect(wrong).toContain("当天的真实标题");
  });
  it("keeps the archived card usable when its preview fails, and empty days compact", () => {
    const html = renderToStaticMarkup(<DiarySelection date={archived.date} item={archived} known preview={{ entryId: archived.entryId, date: archived.date, entry: null, loading: false, error: "private failure" }} onOpen={vi.fn()} />);
    expect(html).toContain("正文预览暂不可用，可进入阅读重试。"); expect(html).not.toContain("private failure");
    expect(html).toContain("阅读全文：当天的真实标题"); expect(html).not.toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
    const empty = renderToStaticMarkup(<DiarySelection date="2026-10-12" item={null} known onOpen={vi.fn()} />);
    expect(empty).toContain("日历中尚无这一天的记录。"); expect(empty).not.toMatch(/<button|min-h-|diary-entry-link|data-diary-marker/);
  });
  it("shows loading/read errors and explicitly identifies failed refresh with retained data", () => {
    const loading = renderCalendar({ ...loaded, calendar: null, calendarLoading: true });
    expect(loading).toContain("正在读取日历"); expect(loading).not.toContain("日历中尚无这一天的记录");
    const failed = renderCalendar({ ...loaded, calendar: null, calendarError: "网络连接中断，请重试。" });
    expect(failed).toContain('role="alert"'); expect(failed).toContain("重新读取日历"); expect(failed).not.toContain("日历中尚无这一天的记录");
    const stale = renderCalendar({ ...loaded, calendarError: "网络连接中断，请重试。" });
    expect(stale).toContain("刷新未成功，以下保留上次读取的索引"); expect(stale).toContain("当天的真实标题");
  });
});

describe("Diary full-text reader and page", () => {
  const reader = { entryId: "archive", date: "2026-10-09", entry: { id: "archive", date: "2026-10-09", title: "真实标题", content: "第一段\n\n第二段", importance: null, tags: [] as readonly string[], keywords: [] as readonly string[] }, loading: false, error: null };
  it("uses one independent scroll owner, fixed return/date and complete escaped plain text", () => {
    const content = "**原样保留**\n\n<script>example</script>\n" + "长正文\n".repeat(350) + "english".repeat(600) + "末尾";
    const html = renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry: { ...reader.entry, content } }} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html.indexOf("返回日历")).toBeLessThan(html.indexOf('data-page-scroll-region="true"'));
    expect(html.indexOf('datetime="2026-10-09"')).toBeLessThan(html.indexOf('data-page-scroll-region="true"'));
    expect(html.indexOf('id="diary-entry-title"')).toBeLessThan(html.indexOf('data-page-scroll-area="true"'));
    expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
    expect(html).toContain("**原样保留**\n\n&lt;script&gt;example&lt;/script&gt;");
    expect(html).toContain("末尾"); expect(html).toContain("[overflow-wrap:anywhere]"); expect(html).toContain("whitespace-pre-wrap");
    expect(html).not.toMatch(/<script|<strong|<img|line-clamp|truncate|<textarea|下一篇/);
  });
  it.each([null, "", " \n "])("uses a display-only untitled fallback: %s", (title) => {
    expect(renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry: { ...reader.entry, title } }} onBack={vi.fn()} onRetry={vi.fn()} />)).toContain("无标题");
  });
  it.each([[0, "low", "较低"], [0.59, "low", "较低"], [0.6, "mid", "中等"], [0.79, "mid", "中等"], [0.8, "high", "较高"], [1, "high", "较高"]] as const)("uses the legacy importance %s mapping only as a line and accessible description", (importance, level, label) => {
    const html = renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry: { ...reader.entry, importance } }} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html).toContain(`data-importance-level="${level}"`);
    expect(html).toContain(`<span class="sr-only">日记重要度${label}。</span>`);
    expect(html).not.toMatch(/重要度\s*[0-9]|lucide-star|diary-importance/);
  });
  it.each([null, -1, 2, NaN, Infinity, "0.8" as unknown as number])("omits the importance line for missing or out-of-contract values: %s", (value) => {
    expect(diaryReaderImportance(value)).toBeNull();
    const html = renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry: { ...reader.entry, importance: value } }} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html).not.toContain("data-importance-level"); expect(html).not.toContain("日记重要度");
  });
  it("keeps tags above the body and keywords below the body scroller on one paper", () => {
    const keywords = ["shared_moment", "亲近", "https://example.com/" + "longword".repeat(60)];
    const html = renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry: { ...reader.entry, tags: ["shared_moment", "emotion", "自定义分类", "__proto__"], keywords } }} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html).toContain('aria-label="日记标签"'); expect(html).toContain('aria-label="日记关键词"');
    expect(html).toContain("共同经历"); expect(html).toContain("情感时刻"); expect(html).toContain("自定义分类"); expect(html).toContain("__proto__");
    expect(html).toContain("shared_moment"); expect(html).toContain(keywords[2]);
    expect(html.indexOf('aria-label="日记标签"')).toBeLessThan(html.indexOf('data-page-scroll-area="true"'));
    const scrollerEnd = html.indexOf('</article></div></div>');
    expect(scrollerEnd).toBeGreaterThan(html.indexOf("第二段"));
    expect(html.indexOf('<footer')).toBeGreaterThan(scrollerEnd);
    expect(html.match(/diary-paper/g)).toHaveLength(1); expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
    expect(html).not.toMatch(/>标签<|>日记正文<|<dt/);
  });
  it("does not reserve empty tag or keyword areas", () => {
    const html = renderToStaticMarkup(<DiaryReader reader={reader} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html).not.toMatch(/aria-label="日记标签"|aria-label="日记关键词区"|<footer/);
    expect(DiaryReaderTags({ tags: [] })).toBeNull();
  });
  it("keeps the full extreme title and all tag identities available beside the original heading", () => {
    const title = "超长标题🦉https://example.com/".repeat(100), tags = Array.from({ length: 80 }, (_, index) => `分类${index}`);
    const entry = { ...reader.entry, title, tags };
    const html = renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry }} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html).toContain(title); expect(html).toContain('aria-label="查看完整标题与分类"'); expect(html).toContain("分类79");
    const tree = DiaryReaderHeading({ entry });
    expect(renderToStaticMarkup((find(tree, (el) => el.type === "p"))!)).toContain(title);
    const fullTags = find(tree, (el) => el.type === DiaryReaderTags);
    expect(fullTags?.props).toMatchObject({ tags });
    expect(html).not.toMatch(/查看完整阅读信息|阅读信息|lucide-ellipsis/);
  });
  it("caps only metadata and uses actual Reader height for short-screen fallbacks", () => {
    const css = readFileSync(new URL("./diary.css", import.meta.url), "utf8");
    expect(css).toContain("container: diary-reader / size");
    expect(css).toContain(".diary-reader-header, .diary-reader-keywords { flex-shrink: 0; }");
    expect(css).toContain(".diary-reader-body { flex: 1 1 0; min-block-size: 0; overflow: hidden; }");
    expect(css).toContain("-webkit-line-clamp: 2");
    expect(css).toContain(".diary-reader-keyword-window { max-block-size: calc(3rem + 10px); overflow: hidden; }");
    expect(css).toContain(".diary-reader-chip-full { white-space: normal; overflow-wrap: anywhere; overflow: visible; }");
    expect(css).toContain("padding-bottom: max(1rem, env(safe-area-inset-bottom))");
    expect(css).toContain("@container diary-reader (max-height: 24rem)");
    expect(css).toContain(".diary-reader-date { display: none; }");
    expect(css).toContain("@container diary-reader (max-height: 9rem)");
    expect(css).toContain("var(--color-primary) 45%, var(--color-border)");
    expect(css).toContain('.diary-reader-heading[data-importance-level="high"]::before { background: var(--color-primary); }');
    expect(css).not.toMatch(/position:\s*fixed|overflow-y:\s*(auto|scroll)/);
  });
  it("does not render missing or malformed metadata as content or default importance", () => {
    const entry = parseArchivedDiary({ id: reader.entryId, date: reader.date, title: null, status: "done", content: "正文末尾", importance: "0.8", tags: '{"bad":null}', keywords: [null, false, {}, " "] }, reader.entryId, reader.date);
    const html = renderToStaticMarkup(<DiaryReader reader={{ ...reader, entry }} onBack={vi.fn()} onRetry={vi.fn()} />);
    expect(html).toContain("正文末尾"); expect(html).not.toMatch(/重要度|日记标签|日记关键词|<footer|\[object Object\]|>null</);
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
    const setting = vi.spyOn(active, "loadAutoFeed").mockResolvedValue(true);
    vi.mocked(useDiary).mockReturnValue({ state: loaded, controller: active, today: "2026-10-23" });
    vi.mocked(useDiaryNavigation).mockReturnValue({ calendarRef: createRef(), readerRef: createRef(), openButtonRef: createRef(), dateButtonRef: createRef(), open: vi.fn(), back: vi.fn() });
    const tree = DiaryView({});
    click(find(tree, (el) => el.props["aria-label"] === "刷新日历")); expect(refresh).toHaveBeenCalledOnce();
    expect(setting).toHaveBeenCalledOnce();
    expect(renderPage(loaded)).toContain("开始投喂");
    expect(renderPage(loaded)).not.toMatch(/继续写|封面|摘要|Chat/);
  });
});
