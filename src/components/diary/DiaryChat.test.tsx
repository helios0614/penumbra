import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bubble } from "@/components/chat/Bubble";
import { BubbleList } from "@/components/chat/BubbleList";
import { ChatShell } from "@/components/chat/ChatShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { elements, find, hookSession } from "@/components/chat/test-utils/hook-session";
import type { DiaryCalendarItem } from "@/domain/diary";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";
import { DiarySelection } from "./DiaryCalendar";
import { presentDiaryMessage } from "./diary-chat-presenter";
import { diaryChatEntry, diaryChatUrl } from "./diary-chat-navigation";
import { useDiaryChatNavigation } from "./useDiaryChatNavigation";

vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>() }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const pending: DiaryCalendarItem = { entryId: "entry/real", date: "2026-10-09", title: "草稿", entryStatus: "writing", hasDiaryMessages: true, hasSavedContent: false, calendarState: "pending", invalidReason: null };
const row = (role: string, content: string): DiaryMessage => ({ id: `m-${role}`, entryId: pending.entryId, role, content, createdAt: 10, updatedAt: 0, drift: "DRIFT 内容", thinking: "Thinking 内容" });

describe("Diary Chat display assembly", () => {
  it("offers sibling Chat and formal-reading actions for archived entries, and Chat for pending", () => {
    const open = vi.fn(), chat = vi.fn();
    const tree = DiarySelection({ item: pending, date: pending.date, known: true, onOpen: open, onOpenChat: chat });
    (find(tree, Button, props => props.variant === "link").props.onClick as () => void)();
    expect(chat).toHaveBeenCalledWith(pending); expect(open).not.toHaveBeenCalled();
    for (const item of [{ ...pending, entryId: "" }, { ...pending, calendarState: "invalid" as const }]) {
      expect(elements(DiarySelection({ item, date: item.date, known: true, onOpen: open, onOpenChat: chat })).filter(n => n.type === Button)).toHaveLength(0);
    }
    const archived = { ...pending, calendarState: "archived" as const, hasSavedContent: true, entryStatus: "done" };
    const archivedTree = DiarySelection({ item: archived, date: archived.date, known: true, onOpen: open, onOpenChat: chat });
    (find(archivedTree, Button, props => props.variant === "link").props.onClick as () => void)();
    expect(chat).toHaveBeenLastCalledWith(archived); expect(open).not.toHaveBeenCalled();
    (find(archivedTree, Button, props => String(props["aria-label"]).startsWith("阅读全文")).props.onClick as () => void)();
    expect(open).toHaveBeenCalledWith(archived); expect(chat).toHaveBeenCalledTimes(2);
    for (const item of [pending, archived]) {
      const html = renderToStaticMarkup(<DiarySelection item={item} date={item.date} known onOpen={open} onOpenChat={chat} />);
      expect(html).toContain('data-diary-selection-meta="true"');
      expect(html).toContain("lucide-messages-square");
      expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
    }
  });
  it("uses shared Markdown, code, thinking and DRIFT without message actions", () => {
    const message = presentDiaryMessage(row("assistant", "**粗体**\n\n```ts\nconst saved = true;\n```"));
    const html = renderToStaticMarkup(<TooltipProvider><Bubble message={message} showActions={false} /></TooltipProvider>);
    expect(html).toContain("<strong>粗体</strong>"); expect(html).toContain("const"); expect(html).toContain("Thinking"); expect(html).toContain("DRIFT");
    for (const label of ["复制消息", "编辑消息", "重新生成回复", "放入输入框", "删除消息"]) expect(html).not.toContain(label);
    expect(renderToStaticMarkup(<TooltipProvider><Bubble message={message} /></TooltipProvider>)).toContain("复制消息");
  });
  it("retains genuine user prompts and unfamiliar persisted roles without Main capability parsing", () => {
    const user = presentDiaryMessage(row("user", "【记忆原文】\n\n真实自动投喂材料")); expect(user.kind).toBe("user");
    expect(renderToStaticMarkup(<TooltipProvider><Bubble message={user} showActions={false} /></TooltipProvider>)).toContain("真实自动投喂材料");
    const unknown = presentDiaryMessage(row("system", "保留的 system 原文")); expect(unknown.kind).toBe("unknown");
    expect(renderToStaticMarkup(<Bubble message={unknown} showActions={false} />)).toContain("保留的 system 原文");
  });
  it("renders repeated contents and repeated date groups in original sequence with no Composer", () => {
    const messages = [row("user", "相同正文"), row("assistant", "相同正文"), { ...row("user", "第三条"), id: "third", createdAt: 864000 }].map(presentDiaryMessage);
    const html = renderToStaticMarkup(<TooltipProvider><ChatShell header={<h1>Diary Chat</h1>} composer={null}><BubbleList timelineKey="diary:e" messages={messages} showActions={false} /></ChatShell></TooltipProvider>);
    expect(html.indexOf('data-message-id="m-user"')).toBeLessThan(html.indexOf('data-message-id="m-assistant"'));
    expect(html.indexOf('data-message-id="m-assistant"')).toBeLessThan(html.indexOf('data-message-id="third"'));
    expect(html.match(/相同正文/g)).toHaveLength(2); expect(html).not.toContain("textarea"); expect(html).not.toContain("chat-composer");
  });
});

describe("Diary-local URL and return navigation", () => {
  it.each(["/app/diary", "/editorial/app/diary"])("preserves %s plus unrelated queries/hash and escapes the real ID", path => {
    const url = diaryChatUrl(`https://example.test${path}?legacy=1&keep=a#section`, "entry/real&特殊");
    const parsed = new URL(url, "https://example.test");
    expect(parsed.pathname).toBe(path); expect(parsed.searchParams.get("keep")).toBe("a"); expect(parsed.hash).toBe("#section");
    expect(diaryChatEntry(parsed.search)).toBe("entry/real&特殊");
    expect(diaryChatUrl(parsed.href, null)).toBe(`${path}?legacy=1&keep=a#section`);
    expect(diaryChatEntry("?diaryEntry=%20")).toBeNull();
  });
  it.each([pending, { ...pending, entryId: "archived/real", calendarState: "archived" as const, entryStatus: "done" }])("restores calendar scroll/focus for $calendarState and responds to browser back/forward", item => {
    const host = new EventTarget(); const trigger = { isConnected: true, disabled: false, focus: vi.fn() };
    vi.stubGlobal("HTMLElement", Object); vi.stubGlobal("document", { activeElement: trigger });
    const location = { href: "https://example.test/app/diary?keep=1#cal", search: "?keep=1" };
    const history = { state: { penumbraApp: "diary" }, pushState: vi.fn((state, _unused, url) => { history.state = state; location.href = new URL(url, location.href).href; location.search = new URL(location.href).search; }), replaceState: vi.fn(), back: vi.fn() };
    vi.stubGlobal("window", Object.assign(host, { location, history }));
    const viewport = { scrollTop: 112, scrollHeight: 900, clientHeight: 300, focus: vi.fn(), contains: () => true };
    const session = hookSession(() => useDiaryChatNavigation({ current: viewport as unknown as HTMLDivElement }, { current: trigger as unknown as HTMLButtonElement }, { current: null }));
    let nav = session.render(); session.commit(); nav.open(item); nav = session.render(); session.commit();
    expect(nav.entryId).toBe(item.entryId); expect(history.state).toMatchObject({ penumbraApp: "diary" }); nav.back(); expect(history.back).toHaveBeenCalledOnce();
    viewport.scrollTop = 0; location.search = "?keep=1"; host.dispatchEvent(new Event("popstate")); nav = session.render(); session.commit();
    expect(nav.entryId).toBeNull(); expect(viewport.scrollTop).toBe(112); expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
    location.search = `?diaryEntry=${encodeURIComponent(item.entryId)}`; host.dispatchEvent(new Event("popstate")); nav = session.render(); session.commit(); expect(nav.entryId).toBe(item.entryId);
    session.dispose();
  });
});
