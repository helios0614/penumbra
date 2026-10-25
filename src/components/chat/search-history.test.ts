import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { hasOpenChatDialog, useSearchBack } from "./search-history";
import { hookSession } from "./test-utils/hook-session";

vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    useRef: vi.fn(actual.useRef),
    useEffect: vi.fn(actual.useEffect),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("ignores mounted closed Popovers, so Back closes search even when focus is outside the input", () => {
  const closed = {
    hasAttribute: (key: string) => key === "data-closed",
    hidden: false,
    getAttribute: () => null,
    getClientRects: () => [{}],
  };
  vi.stubGlobal("document", { querySelectorAll: () => [closed] });
  expect(hasOpenChatDialog()).toBe(false);
  const win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("location", { href: "https://synthetic.invalid/chat" });
  const history = {
    state: null as unknown,
    pushState: vi.fn((value: unknown) => {
      history.state = value;
    }),
    back: vi.fn(() => {
      history.state = null;
      win.dispatchEvent(new Event("popstate"));
    }),
  };
  vi.stubGlobal("history", history);
  const close = vi.fn(),
    hooks = hookSession(() => useSearchBack(true, close));
  hooks.render();
  hooks.commit();
  expect(history.pushState).toHaveBeenCalledOnce();
  history.back();
  expect(close).toHaveBeenCalledOnce();
  hooks.dispose();
  expect(history.back).toHaveBeenCalledOnce();
});
it("recognizes only visible open dialogs for topmost Escape handling", () => {
  const opened = {
    hasAttribute: () => false,
    hidden: false,
    getAttribute: () => null,
    getClientRects: () => [{}],
  };
  vi.stubGlobal("document", { querySelectorAll: () => [opened] });
  expect(hasOpenChatDialog()).toBe(true);
});
