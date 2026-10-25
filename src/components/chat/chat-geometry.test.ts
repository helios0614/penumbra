import { afterEach, describe, expect, it, vi } from "vitest";
import { trackChatViewport } from "./chat-viewport";
import { trackChatScroll } from "./chat-scroll";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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
    viewport.scrollHeight = 2400;
    // The 200ms Composer transition generates multiple ResizeObserver frames.
    for (const height of [270, 260, 250, 240, 230, 220]) {
      viewport.clientHeight = height; resize(); expect(viewport.scrollTop).toBe(600);
    }
    viewport.clientHeight = 480; resize(); expect(viewport.scrollTop).toBe(600);
    stop(); expect(disconnect).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("chat-capability-toggle", expect.any(Function));
  });
  it("keeps explicit tool reading anchored during repeated expansions and resumes following on user scroll", () => {
    let resize = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn(); disconnect = vi.fn();
    });
    let messageTop = 40;
    const item = { dataset: { messageId: "first-visible" }, getBoundingClientRect: () => ({ top: messageTop, bottom: messageTop + 100 }) };
    const viewport = Object.assign(new EventTarget(), {
      scrollTop: 1520, scrollHeight: 2000, clientHeight: 480,
      getBoundingClientRect: () => ({ top: 20 }), querySelectorAll: () => [item],
    });
    const following = { current: true }, anchor = { current: null };
    const stop = trackChatScroll(viewport as unknown as HTMLElement, {} as HTMLElement, following, anchor);
    viewport.dispatchEvent(new Event("chat-capability-toggle"));
    expect(following.current).toBe(false);
    expect(anchor.current).toEqual({ id: "first-visible", offset: 20 });
    viewport.scrollHeight += 300; resize(); expect(viewport.scrollTop).toBe(1520);
    messageTop += 120; resize(); expect(viewport.scrollTop).toBe(1640);
    messageTop -= 120;
    viewport.dispatchEvent(new Event("chat-capability-toggle"));
    viewport.scrollHeight += 200; resize(); expect(viewport.scrollTop).toBe(1640);
    viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    viewport.dispatchEvent(new Event("wheel"));
    viewport.dispatchEvent(new Event("scroll")); expect(following.current).toBe(true);
    viewport.scrollHeight += 100; resize(); expect(viewport.scrollTop).toBe(viewport.scrollHeight);
    stop();
  });
  it("does not resume bottom-follow during animation clamping, anchor scroll events or keyboard resize", () => {
    vi.useFakeTimers();
    let resize = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn(); disconnect = vi.fn();
    });
    let messageTop = 20;
    const item = { dataset: { messageId: "reading" }, getBoundingClientRect: () => ({ top: messageTop, bottom: messageTop + 100 }) };
    const viewport = Object.assign(new EventTarget(), { scrollTop: 1520, scrollHeight: 2000, clientHeight: 480,
      getBoundingClientRect: () => ({ top: 20 }), querySelectorAll: () => [item] });
    const following = { current: true };
    const stop = trackChatScroll(viewport as unknown as HTMLElement, {} as HTMLElement, following);
    for (let click = 0; click < 5; click++) {
      viewport.dispatchEvent(new Event("chat-capability-toggle"));
      for (const height of [280, 260, 240, 230, 220, 480]) {
        viewport.clientHeight = height;
        viewport.scrollHeight = viewport.scrollTop + height; // Browser clamps to the new bottom.
        viewport.dispatchEvent(new Event("scroll")); resize();
        expect(following.current).toBe(false);
      }
      vi.advanceTimersByTime(100);
    }
    messageTop += 20; resize();
    vi.advanceTimersByTime(300);
    viewport.dispatchEvent(new Event("scroll")); // Anchor restoration scroll is still not user intent.
    expect(following.current).toBe(false);
    viewport.dispatchEvent(new Event("touchmove"));
    viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
    viewport.dispatchEvent(new Event("scroll"));
    expect(following.current).toBe(true);
    stop();
  });
});
