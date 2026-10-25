import { afterEach, expect, it, vi } from "vitest";
import { trackSearchOverlayPosition } from "./search-overlay-position";

afterEach(() => vi.unstubAllGlobals());

it("keeps the portalled search aligned through composer, keyboard and viewport changes, then releases observers", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const visual = Object.assign(new EventTarget(), { height: 800 });
  const view = Object.assign(new EventTarget(), {
    visualViewport: visual, innerHeight: 850,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
  });
  let resize = () => {};
  const observe = vi.fn(), disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  const bounds = { left: 24, top: 80, width: 390, height: 650 };
  const anchor = { ownerDocument: { defaultView: view }, getBoundingClientRect: () => bounds } as unknown as HTMLElement;
  const update = vi.fn();
  const flush = () => {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(0));
  };
  const stop = trackSearchOverlayPosition(anchor, update);
  expect(observe).toHaveBeenCalledWith(anchor);
  expect(update).toHaveBeenLastCalledWith({ ...bounds, "--chat-visual-height": "800px" });
  bounds.height = 560; resize(); resize();
  expect(frames.size).toBe(1); flush();
  expect(update).toHaveBeenLastCalledWith({ ...bounds, "--chat-visual-height": "800px" });
  visual.height = 420; visual.dispatchEvent(new Event("resize")); flush();
  expect(update).toHaveBeenLastCalledWith({ ...bounds, "--chat-visual-height": "420px" });
  bounds.top = 40; visual.dispatchEvent(new Event("scroll")); flush();
  expect(update).toHaveBeenLastCalledWith({ ...bounds, "--chat-visual-height": "420px" });
  const calls = update.mock.calls.length;
  view.dispatchEvent(new Event("scroll")); flush();
  expect(update).toHaveBeenCalledTimes(calls);
  view.dispatchEvent(new Event("resize"));
  expect(frames.size).toBe(1); stop();
  expect(disconnect).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
  visual.dispatchEvent(new Event("resize")); visual.dispatchEvent(new Event("scroll"));
  view.dispatchEvent(new Event("resize")); view.dispatchEvent(new Event("scroll"));
  expect(frames.size).toBe(0); expect(update).toHaveBeenCalledTimes(calls);
});
