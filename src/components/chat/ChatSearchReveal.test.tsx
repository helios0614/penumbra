import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatSearchReveal } from "./ChatSearchReveal";
import { find, hookSession } from "./test-utils/hook-session";

vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    ...Object.fromEntries(
      [
        "useState",
        "useRef",
        "useEffect",
        "useLayoutEffect",
        "useCallback",
        "useId",
      ].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)]),
    ),
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("freezes only the closing paint and immediately removes it from interaction and accessibility", () => {
  vi.useFakeTimers();
  let open = false,
    children = "";
  const hooks = hookSession(() => ChatSearchReveal({ open, children }));
  hooks.render();
  hooks.commit();
  open = true;
  children = "public results";
  hooks.render();
  hooks.commit();
  open = false;
  children = "query state already cleared";
  const closing = hooks.render();
  hooks.commit();
  expect(closing.props.inert).toBe(true);
  expect(closing.props["aria-hidden"]).toBe(true);
  expect(
    find(closing, "div", (p) => p.className === "chat-search-reveal-clip").props
      .children,
  ).toBe("public results");
  vi.advanceTimersByTime(220);
  expect(
    find(
      hooks.render(),
      "div",
      (p) => p.className === "chat-search-reveal-clip",
    ).props.children,
  ).toBe(false);
  hooks.dispose();
});

it("cancels exit cleanup when reopened and clears pending cleanup on unmount", () => {
  vi.useFakeTimers();
  let open = true,
    children = "first";
  const hooks = hookSession(() => ChatSearchReveal({ open, children }));
  hooks.render();
  hooks.commit();
  open = false;
  hooks.render();
  hooks.commit();
  vi.advanceTimersByTime(100);
  open = true;
  children = "second";
  hooks.render();
  hooks.commit();
  vi.advanceTimersByTime(300);
  expect(
    find(
      hooks.render(),
      "div",
      (p) => p.className === "chat-search-reveal-clip",
    ).props.children,
  ).toBe("second");
  open = false;
  hooks.render();
  hooks.commit();
  expect(vi.getTimerCount()).toBe(1);
  hooks.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
