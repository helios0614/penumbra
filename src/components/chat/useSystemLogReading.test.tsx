import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { systemLog } from "@/application/chat-system-log/chat-system-log-store";
import { useSystemLogReading } from "./useSystemLogReading";
import { hookSession } from "./test-utils/hook-session";
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("keeps a short panel's reading anchor through prepends and releases reserve on natural growth/clear", () => {
  systemLog.clear();
  let version = systemLog.getState(), readingTop = 300, contentEnd = 500, scroll = 0, connected = true;
  const style = new Map<string, string>();
  const reserve = () => Number.parseFloat(style.get("--system-log-reading-room") ?? "0");
  const maximum = () => Math.max(0, contentEnd + reserve() - 600);
  const reading = { get isConnected() { return connected; }, getBoundingClientRect: () => ({ top: readingTop - scroll, bottom: readingTop - scroll + 100 }), matches: () => true };
  const root = {
    clientHeight: 600,
    get scrollTop() { return scroll; }, set scrollTop(value: number) { scroll = Math.min(Math.max(value, 0), maximum()); },
    get scrollHeight() { return Math.max(600, contentEnd + reserve()); },
    style: { setProperty: (key: string, value: string) => { style.set(key, value); }, removeProperty: (key: string) => { style.delete(key); scroll = Math.min(scroll, maximum()); } },
    querySelector: () => ({}), querySelectorAll: () => [reading], contains: () => connected,
    getBoundingClientRect: () => ({ top: 0 }),
    lastElementChild: { getBoundingClientRect: () => ({ bottom: contentEnd - scroll }) },
  } as unknown as HTMLDivElement;
  vi.stubGlobal("getComputedStyle", () => ({ paddingBottom: "0px" }));
  const hooks = hookSession(() => useSystemLogReading(true, version));
  hooks.render().current = root; hooks.commit();
  try {
    systemLog.begin({ executionId: "send:reading", conversationId: "a", kind: "send" });
    readingTop += 70; contentEnd += 70; version = systemLog.getState(); hooks.render(); hooks.commit();
    expect(scroll).toBe(70); expect(reading.getBoundingClientRect().top).toBe(300);
    expect(reserve()).toBe(100);
    // Additional content below the reader supplies real range, replacing the reserve.
    systemLog.diagnostic({ task_id: "safe-new-log", has_error: false }, "ws");
    contentEnd += 500; version = systemLog.getState(); hooks.render(); hooks.commit();
    expect(scroll).toBe(70); expect(reading.getBoundingClientRect().top).toBe(300); expect(reserve()).toBe(0);
    systemLog.clear(); connected = false; contentEnd = 100; version = systemLog.getState(); hooks.render(); hooks.commit();
    expect(reserve()).toBe(0); expect(scroll).toBe(0);
  } finally { hooks.dispose(); }
});
