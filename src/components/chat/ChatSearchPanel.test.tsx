import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MessageSearchPage, MessageSearchResult } from "@/domain/message";
import { ChatSearchPanel } from "./ChatSearchPanel";
import type { useChatSearch } from "./useChatSearch";
import { elements, find } from "./test-utils/hook-session";

vi.mock("@/components/identity/AiNameContext", () => ({ useAiName: () => "合成助手" }));
vi.mock("./useSearchResultScroll", () => ({
  useSearchResultScroll: () => ({ current: null }),
}));

const result = (id: string): MessageSearchResult => ({
  messageId: id,
  createdAt: 100,
  role: "assistant",
  publicRevision: id,
  snippets: [
    { segmentKey: "body", text: `公开关键词 ${id}`, matchRanges: [[2, 5]] },
  ],
});
function fixture() {
  const search: ReturnType<typeof useChatSearch> = {
    open: true,
    query: "关键词",
    composing: false,
    state: {
      items: [result("a"), result("b"), result("c")],
      next: "next",
      status: "ready",
      selected: "b",
      paused: false,
      error: null,
    },
    show: vi.fn(),
    dismiss: vi.fn(),
    setQuery: vi.fn(),
    setComposing: vi.fn(),
    select: vi.fn(),
    loadMore: vi.fn(
      async (): Promise<MessageSearchPage | undefined> => undefined,
    ),
    retry: vi.fn(async (): Promise<MessageSearchPage | undefined> => undefined),
    stop: vi.fn(),
  };
  const props = {
    search,
    onJump: vi.fn(),
    onClose: vi.fn(),
    onReturn: vi.fn(),
    onLatest: vi.fn(),
  };
  return { ...props, tree: () => ChatSearchPanel(props) };
}
function action(tree: React.ReactNode, label: string) {
  return find(
    tree,
    Button,
    (p) => p["aria-label"] === label || p.children === label,
  );
}
describe("Chat search panel controls", () => {
  it("uses the shared Input while retaining change, composition, Enter, Escape and clear actions", () => {
    const f = fixture(),
      input = find(f.tree(), Input).props;
    input.onChange?.({ target: { value: "中文输入" } } as never);
    input.onCompositionStart?.({} as never);
    const preventDefault = vi.fn();
    input.onKeyDown?.({
      key: "Enter",
      nativeEvent: { isComposing: true },
      preventDefault,
    } as never);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(f.onJump).not.toHaveBeenCalled();
    input.onCompositionEnd?.({} as never);
    expect(f.search.setQuery).toHaveBeenCalledWith("中文输入");
    expect(f.search.setComposing).toHaveBeenNthCalledWith(1, true);
    expect(f.search.setComposing).toHaveBeenNthCalledWith(2, false);
    input.onKeyDown?.({
      key: "Enter",
      nativeEvent: { isComposing: false },
      preventDefault,
    } as never);
    expect(f.onJump).toHaveBeenCalledWith(f.search.state.items[2]);
    input.onKeyDown?.({
      key: "Escape",
      nativeEvent: { isComposing: false },
      preventDefault,
    } as never);
    expect(f.onClose).toHaveBeenCalledOnce();
    action(f.tree(), "清空搜索").props.onClick?.({} as never);
    expect(f.search.setQuery).toHaveBeenLastCalledWith("");
    expect(renderToStaticMarkup(f.tree())).toContain('data-slot="input"');
  });
  it("keeps previous/next identities, result blur, close and reading-position callbacks", () => {
    const f = fixture();
    action(f.tree(), "上一条匹配消息").props.onClick?.({} as never);
    expect(f.onJump).toHaveBeenLastCalledWith(f.search.state.items[0]);
    action(f.tree(), "下一条匹配消息").props.onClick?.({} as never);
    expect(f.onJump).toHaveBeenLastCalledWith(f.search.state.items[2]);
    const list = find(f.tree(), "div", (p) => p.role === "list");
    const rows = elements(list.props.children).filter(
      (n) => n.props.role === "listitem",
    );
    expect(rows).toHaveLength(3);
    expect(rows[1].props["aria-current"]).toBe("true");
    const blur = vi.fn();
    (rows[1].props.onClick as (event: unknown) => void)({
      currentTarget: { ownerDocument: { activeElement: { blur } } },
    });
    expect(blur).toHaveBeenCalledOnce();
    expect(f.onJump).toHaveBeenLastCalledWith(f.search.state.items[1]);
    action(f.tree(), "返回搜索前位置").props.onClick?.({} as never);
    action(f.tree(), "回到最新").props.onClick?.({} as never);
    action(f.tree(), "关闭搜索").props.onClick?.({} as never);
    expect(f.onReturn).toHaveBeenCalledOnce();
    expect(f.onLatest).toHaveBeenCalledOnce();
    expect(f.onClose).toHaveBeenCalledOnce();
  });
  it("continues the next result page and keeps footer controls outside the result scroll owner", async () => {
    const f = fixture(),
      next = result("d");
    f.search.state.selected = "c";
    vi.mocked(f.search.loadMore).mockResolvedValue({
      conversationId: "synthetic",
      items: [next],
      nextCursor: null,
      hasMore: false,
      pageStatus: "complete",
    });
    action(f.tree(), "下一条匹配消息").props.onClick?.({} as never);
    await Promise.resolve();
    expect(f.onJump).toHaveBeenCalledWith(next);
    const list = find(f.tree(), "div", (p) => p.role === "list");
    expect(elements(list).some((n) => n.type === Button)).toBe(false);
    action(f.tree(), "继续搜索历史").props.onClick?.({} as never);
    expect(f.search.loadMore).toHaveBeenCalledTimes(2);
  });
  it("distinguishes scanning from a finished empty search without offering an overlapping continue action", () => {
    const f = fixture();
    f.search.state.items = [];
    f.search.state.status = "scanning";
    let html = renderToStaticMarkup(f.tree());
    expect(html).toContain("扫描中…");
    expect(html).not.toContain("没有匹配消息");
    expect(html).not.toContain("继续搜索历史");
    action(f.tree(), "停止搜索").props.onClick?.({} as never);
    expect(f.search.stop).toHaveBeenCalledOnce();
    f.search.state.status = "complete";
    f.search.state.next = null;
    html = renderToStaticMarkup(f.tree());
    expect(html).toContain("没有匹配消息");
    expect(html).not.toContain("继续搜索历史");
  });
  it("omits the empty-query hint and keeps concise status with the original reading actions", () => {
    const f = fixture();
    expect(action(f.tree(), "返回搜索前位置").props.children).toBe("返回原位");
    expect(action(f.tree(), "回到最新").props.onClick).toBe(f.onLatest);
    expect(renderToStaticMarkup(f.tree()).replace(/<[^>]+>/g, "")).toContain(
      "3 条结果",
    );
    expect(renderToStaticMarkup(f.tree())).not.toContain("可继续查找");
    f.search.query = "";
    f.search.state.status = "idle";
    const html = renderToStaticMarkup(f.tree());
    expect(html).not.toContain("输入关键词搜索完整公开历史");
    expect(html).not.toContain('aria-label="搜索结果导航"');
    expect(html).not.toContain('aria-label="历史阅读位置"');
  });
  it("keeps the first row focused on input/close and moves match navigation beside the result status", () => {
    const f = fixture(),
      tree = f.tree();
    const toolbar = find(
      tree,
      "div",
      (p) => p.className?.includes("chat-search-toolbar") === true,
    );
    expect(
      elements(toolbar)
        .filter((n) => n.type === Button)
        .map((n) => n.props["aria-label"]),
    ).toEqual(["清空搜索", "关闭搜索"]);
    const meta = find(
      tree,
      "div",
      (p) => p.className?.includes("chat-search-meta") === true,
    );
    expect(
      elements(meta)
        .filter((n) => n.type === Button)
        .map((n) => n.props["aria-label"]),
    ).toEqual(["上一条匹配消息", "下一条匹配消息"]);
  });
});
