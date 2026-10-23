import { afterEach, describe, expect, it, vi } from "vitest";
import { trackChatViewport } from "./chat-viewport";
import { trackChatScroll } from "./chat-scroll";

afterEach(() => vi.unstubAllGlobals());

describe("Chat geometry and reading intent", () => {
  it("handles overlay keyboards, pan, rotation and layout resize without double compensation", () => {
    const host = new EventTarget(); vi.stubGlobal("window", host);
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const properties = new Map<string, string>();
    const style = { setProperty: (k: string, v: string) => properties.set(k, v), removeProperty: (k: string) => properties.delete(k) };
    const bounds = { bottom: 780, height: 700 };
    const root = { style, getBoundingClientRect: () => bounds } as unknown as HTMLElement;
    let resizeRoot = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resizeRoot = callback; }
      observe = vi.fn(); disconnect = disconnect;
    });
    const stop = trackChatViewport(root, viewport);
    expect(properties.get("--chat-viewport-inset")).toBe("0px");
    viewport.height = 400; viewport.dispatchEvent(new Event("resize"));
    expect(properties.get("--chat-viewport-inset")).toBe("380px");
    viewport.offsetTop = 60; viewport.dispatchEvent(new Event("scroll"));
    expect(properties.get("--chat-viewport-inset")).toBe("320px");
    bounds.bottom = 450; bounds.height = 370; resizeRoot();
    expect(properties.get("--chat-viewport-inset")).toBe("0px");
    viewport.height = 300; host.dispatchEvent(new Event("resize"));
    expect(properties.get("--chat-visual-height")).toBe("300px");
    stop(); expect(properties.size).toBe(0); expect(disconnect).toHaveBeenCalledOnce();
    viewport.dispatchEvent(new Event("resize")); host.dispatchEvent(new Event("resize"));
    expect(properties.size).toBe(0);
  });
  it("leaves CSS/native viewport fallbacks intact without VisualViewport", () => {
    const root = { style: { setProperty: vi.fn() } } as unknown as HTMLElement;
    trackChatViewport(root, null)(); expect(root.style.setProperty).not.toHaveBeenCalled();
  });
  it("follows Composer/keyboard/Thinking growth only when previously following the bottom", () => {
    let resize = () => {};
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = observe; disconnect = disconnect;
    });
    const viewport = Object.assign(new EventTarget(), { scrollTop: 1520, scrollHeight: 2000, clientHeight: 480 });
    const content = {} as HTMLElement, following = { current: true };
    const remove = vi.spyOn(viewport, "removeEventListener");
    const stop = trackChatScroll(viewport as unknown as HTMLElement, content, following);
    expect(observe.mock.calls.map(([target]) => target)).toEqual([viewport, content]);
    viewport.clientHeight = 280; resize();
    expect(viewport.scrollTop).toBe(2000);
    viewport.scrollTop = 600; viewport.dispatchEvent(new Event("scroll"));
    viewport.clientHeight = 220; viewport.scrollHeight = 2400; resize();
    expect(viewport.scrollTop).toBe(600);
    viewport.clientHeight = 480; resize(); expect(viewport.scrollTop).toBe(600);
    stop(); expect(disconnect).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce();
  });
});
