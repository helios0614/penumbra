import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilityReveal } from "./CapabilityReveal";
import { elements, hookSession } from "../test-utils/hook-session";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("capability transition presence", () => {
  it("lazily mounts long content, makes exits inert immediately, and cancels stale cleanup on rapid reopen", () => {
    vi.useFakeTimers();
    let open = false;
    const s = hookSession(() => CapabilityReveal({ open, children: <pre>{"长正文".repeat(10000)}</pre> }));
    const content = () => elements(s.render()).some(node => node.type === "pre");
    expect(content()).toBe(false); s.commit(); expect(vi.getTimerCount()).toBe(0);
    open = true; expect(content()).toBe(true); s.commit();
    open = false;
    const exiting = s.render(); s.commit();
    expect(exiting.props.inert).toBe(true); expect(exiting.props["aria-hidden"]).toBe(true);
    expect(content()).toBe(true);
    vi.advanceTimersByTime(100);
    open = true; s.render(); s.commit();
    vi.advanceTimersByTime(300); expect(content()).toBe(true);
    for (let i = 0; i < 4; i++) { open = !open; s.render(); s.commit(); vi.advanceTimersByTime(20); }
    open = false; s.render(); s.commit();
    vi.advanceTimersByTime(220); expect(content()).toBe(false);
    s.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans pending exits on unmount", () => {
    vi.useFakeTimers();
    let open = true;
    const s = hookSession(() => CapabilityReveal({ open, children: "内容" }));
    s.render(); s.commit(); open = false; s.render(); s.commit();
    expect(vi.getTimerCount()).toBe(1);
    s.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
});
