import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { hookSession } from "./test-utils/hook-session";
import { useReadonlyDialogFrame } from "./useReadonlyDialogFrame";
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, useRef: vi.fn(actual.useRef), useEffect: vi.fn(actual.useEffect) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function browser() {
  const host = Object.assign(new EventTarget(), { innerHeight: 850 });
  const stack: unknown[] = [null];
  const history = {
    state: null as unknown,
    pushState: vi.fn((value: unknown) => { stack.push(value); history.state = value; }),
    back: vi.fn(() => { stack.pop(); history.state = stack[stack.length - 1]; host.dispatchEvent(new Event("popstate")); }),
  };
  vi.stubGlobal("window", host); vi.stubGlobal("history", history); vi.stubGlobal("location", { href: "https://synthetic.invalid/chat" });
  return history;
}
it("Back closes the nested context before search and does not leave an extra entry on close", async () => {
  const history = browser();
  let outer = true, inner = true;
  const closeOuter = vi.fn(() => { outer = false; }), closeInner = vi.fn(() => { inner = false; });
  const h = hookSession(() => { useReadonlyDialogFrame(outer, closeOuter, "search"); useReadonlyDialogFrame(inner, closeInner, "context"); });
  h.render(); h.commit(); expect(history.pushState).toHaveBeenCalledTimes(2);
  history.back(); expect(closeInner).toHaveBeenCalledOnce(); expect(closeOuter).not.toHaveBeenCalled();
  h.render(); h.commit(); await Promise.resolve(); expect(history.back).toHaveBeenCalledOnce();
  history.back(); expect(closeOuter).toHaveBeenCalledOnce();
  h.render(); h.commit(); h.dispose(); await Promise.resolve(); expect(history.back).toHaveBeenCalledTimes(2);
});
it("reuses the same history entry through synchronous StrictMode effect replay", async () => {
  const history = browser();
  const h = hookSession(() => useReadonlyDialogFrame(true, vi.fn(), "context"));
  h.render(); h.commit();
  const setup = vi.mocked(React.useEffect).mock.calls[1]![0];
  const cleanup = setup(); if (typeof cleanup === "function") cleanup();
  setup(); await Promise.resolve();
  expect(history.pushState).toHaveBeenCalledOnce(); expect(history.back).not.toHaveBeenCalled();
  h.dispose(); await Promise.resolve(); expect(history.back).toHaveBeenCalledOnce();
});
