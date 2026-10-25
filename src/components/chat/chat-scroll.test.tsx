import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleList, type ChatReadingHandle } from "./BubbleList";
import { chatJumpOffset } from "./chat-scroll";
import { ScrollArea } from "@/components/ui/scroll-area";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useRef: vi.fn(actual.useRef), useEffect: vi.fn(actual.useEffect), useLayoutEffect: vi.fn(actual.useLayoutEffect), useMemo: vi.fn(actual.useMemo) };
});
afterEach(() => vi.restoreAllMocks());

// Run the existing follow effects against an isolated message viewport.
function session() {
  const viewport = Object.assign(new EventTarget(), { scrollTop: 0, scrollHeight: 2000, clientHeight: 480 });
  const scroll = vi.fn(), root = { querySelector: vi.fn(() => viewport) };
  let position = 0;
  Object.defineProperty(viewport, "scrollTop", { get: () => position, set: (value: number) => { position = value; scroll(); } });
  const refs: { current: unknown }[] = [], deps: (readonly unknown[])[] = [], cleanups: (() => void)[] = [];
  let refIndex = 0, effectIndex = 0;
  const effects: (() => void)[] = [];
  vi.spyOn(React, "useRef").mockImplementation(((initial: unknown) => {
    const index = refIndex++;
    return refs[index] ??= { current: index === 0 ? root : initial };
  }) as typeof React.useRef);
  vi.spyOn(React, "useMemo").mockImplementation(((compute: () => unknown) => compute()) as typeof React.useMemo);
  vi.spyOn(React, "useEffect").mockImplementation(((effect: () => void | (() => void), next: readonly unknown[]) => {
    const index = effectIndex++;
    if (!deps[index] || next.some((value, n) => value !== deps[index][n])) {
      deps[index] = next;
      effects.push(() => { cleanups[index]?.(); cleanups[index] = effect() || (() => {}); });
    }
  }) as typeof React.useEffect);
  vi.spyOn(React, "useLayoutEffect").mockImplementation(React.useEffect);
  const render = (content: string, conversationId = "a", forceFollowKey: string | null = null, options: Partial<React.ComponentProps<typeof BubbleList>> = {}) => {
    refIndex = 0; effectIndex = 0;
    const component = BubbleList as unknown as { type: (props: React.ComponentProps<typeof BubbleList>) => React.ReactElement<{ children: React.ReactElement }> };
    const tree = component.type({ timelineKey: conversationId, forceFollowKey, messages: [{ id: "reply", kind: "assistant", content, createdAt: 1, thinking: null, simpleThink: null, attachments: [] }], ...options });
    effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  return { viewport, scroll, root, render, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}

describe("Chat message scroll regression", () => {
  it("resumes following after closing an overlay without moving the current near-bottom position", () => {
    const s = session(), readingRef: React.MutableRefObject<ChatReadingHandle | null> = { current: null };
    s.render("one", "a", null, { readingRef });
    s.viewport.scrollTop = 1450; s.viewport.dispatchEvent(new Event("scroll")); s.scroll.mockClear();
    readingRef.current!.suspend(); readingRef.current!.resumeFollowing();
    s.render("one", "a", null, { readingRef });
    expect(s.viewport.scrollTop).toBe(1450);
    expect(s.scroll).not.toHaveBeenCalled();
    s.render("new confirmed reply", "a", null, { readingRef });
    expect(s.scroll).toHaveBeenCalledOnce();
    s.dispose();
  });
  it("avoids the covering search panel for result jumps while preserving bookmark offsets", () => {
    let bottom = 400;
    const panel = { getBoundingClientRect: () => ({ bottom }) };
    const anchor = { dataset: { chatSearchAnchor: "search-a" }, ownerDocument: { getElementById: (id: string) => id === "search-a" ? { querySelector: () => panel } : null } };
    const viewport = { clientHeight: 480, getBoundingClientRect: () => ({ top: 100 }), closest: () => ({ querySelector: () => anchor }) } as unknown as HTMLElement;
    expect(chatJumpOffset(viewport)).toBe(316);
    expect(chatJumpOffset(viewport, 23)).toBe(23);
    bottom = 800;
    expect(chatJumpOffset(viewport)).toBe(432);
    expect(chatJumpOffset({ ...viewport, closest: () => null } as unknown as HTMLElement)).toBe(96);
  });
  it("keeps the ScrollArea owner, follows new text near the bottom and respects upward reading", () => {
    const s = session(), tree = s.render("hello");
    expect(tree.props.children.type).toBe(ScrollArea);
    expect(s.root.querySelector).toHaveBeenCalledWith('[data-slot="scroll-area-viewport"]');
    expect(s.scroll).toHaveBeenCalledOnce(); s.scroll.mockClear();
    s.viewport.scrollTop = 1000; s.scroll.mockClear(); s.viewport.dispatchEvent(new Event("scroll"));
    s.render("hello, streaming"); expect(s.scroll).not.toHaveBeenCalled();
    s.viewport.scrollTop = 1424; s.scroll.mockClear(); s.viewport.dispatchEvent(new Event("scroll")); // 96px boundary
    s.render("hello, streaming more");
    expect(s.scroll).toHaveBeenCalled(); s.dispose();
  });
  it("preserves explicit follow/conversation changes and releases the viewport listener", () => {
    const s = session(), remove = vi.spyOn(s.viewport, "removeEventListener"); s.render("one");
    s.viewport.scrollTop = 500; s.viewport.dispatchEvent(new Event("scroll")); s.scroll.mockClear();
    s.render("two", "a", "sent-message"); expect(s.scroll).toHaveBeenCalledOnce();
    s.viewport.dispatchEvent(new Event("scroll")); s.scroll.mockClear();
    s.render("three", "b"); expect(s.scroll).toHaveBeenCalledOnce();
    const types = ["scroll", "chat-capability-toggle", "wheel", "touchmove", "keydown"];
    for (const type of types) expect(remove.mock.calls.filter(([event]) => event === type)).toHaveLength(type === "scroll" ? 2 : 1);
    s.dispose();
    for (const type of types) expect(remove.mock.calls.filter(([event]) => event === type)).toHaveLength(type === "scroll" ? 4 : 2);
  });
});
