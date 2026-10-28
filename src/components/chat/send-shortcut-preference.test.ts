import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
async function fixture() {
  const memory = new Map<string, string>();
  const events = new EventTarget();
  const localStorage = { getItem: vi.fn((key: string) => memory.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { memory.set(key, value); }) };
  vi.stubGlobal("window", Object.assign(events, { localStorage }));
  return { ...await import("./send-shortcut-preference"), memory, localStorage, events };
}

describe("browser-local send preference", () => {
  it("defaults missing and invalid values to none and restores all valid saved values", async () => {
    const s = await fixture();
    expect(s.getSendShortcut()).toBe("none");
    for (const [value, expected] of [["none", "none"], ["enter", "enter"], ["shift-enter", "shift-enter"],
      ["cmd-enter", "none"], ["", "none"], ["ENTER", "none"], ['{"value":"enter"}', "none"]]) {
      s.memory.set(s.SEND_SHORTCUT_KEY, value);
      expect(s.getSendShortcut()).toBe(expected);
    }
  });
  it("saves only the local key, notifies the current page and survives module reload", async () => {
    const s = await fixture(), listener = vi.fn();
    s.events.addEventListener("penumbra-chat-send-shortcut-change", listener);
    s.setSendShortcut("shift-enter");
    expect(listener).toHaveBeenCalledOnce(); expect(s.memory.size).toBe(1);
    expect(s.localStorage.setItem).toHaveBeenCalledExactlyOnceWith(s.SEND_SHORTCUT_KEY, "shift-enter");
    vi.resetModules(); expect((await import("./send-shortcut-preference")).getSendShortcut()).toBe("shift-enter");
  });
  it("keeps changes effective in memory when persistence is blocked", async () => {
    const s = await fixture();
    s.localStorage.setItem.mockImplementation(() => { throw new Error("quota"); });
    s.setSendShortcut("enter"); expect(s.getSendShortcut()).toBe("enter");
    s.setSendShortcut("none"); expect(s.getSendShortcut()).toBe("none");
  });
});
