import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ComposerToolsMenu } from "./ComposerToolsMenu";
import { trackComposerMenuAnchor } from "./composer-menu-anchor";
import { find, hookSession } from "./test-utils/hook-session";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Composer tools geometry", () => {
  it("tracks through the closing animation, stops while hidden, and starts fresh on reopen", () => {
    const request = vi.fn(() => 7), cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request); vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.stubGlobal("window", { innerHeight: 700, innerWidth: 390 });
    const element = { getBoundingClientRect: () => ({ x: 12, y: 600, width: 366, height: 60 }) } as HTMLDivElement;
    const props = { anchor: { current: element }, inputRef: { current: null }, open: true,
      onOpenChange: vi.fn(), label: "模型", children: <div /> };
    const s = hookSession(() => ComposerToolsMenu(props));
    s.render(); s.commit(); expect(request).toHaveBeenCalledOnce();
    props.open = false; s.render(); s.commit(); expect(cancel).not.toHaveBeenCalled();
    find(s.render(), Popover).props.onOpenChangeComplete?.(false);
    s.render(); s.commit(); expect(cancel).toHaveBeenCalledOnce();
    props.open = true; s.render(); s.commit(); s.render(); s.commit();
    expect(request).toHaveBeenCalledTimes(2); s.dispose(); expect(cancel).toHaveBeenCalledTimes(2);
  });
  it("remeasures a moving top even when the bottom trigger is stationary, and returns live rather than cached rects", () => {
    let tick = () => {}; const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => { tick = callback; return 12; }));
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const viewport = { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 };
    vi.stubGlobal("window", { visualViewport: viewport, innerWidth: 390, innerHeight: 844 });
    const rect = { x: 12, y: 760, width: 366, height: 60 } as DOMRect;
    const element = { getBoundingClientRect: () => ({ ...rect }) } as HTMLElement;
    const update = vi.fn(); const stop = trackComposerMenuAnchor(element, update);
    expect(update).toHaveBeenCalledOnce(); tick(); expect(update).toHaveBeenCalledOnce();
    const firstAnchor = update.mock.calls[0][0];
    for (const height of [68, 76, 88, 96]) {
      rect.y = 820 - height; rect.height = height; tick();
      expect(update.mock.lastCall?.[0].getBoundingClientRect().y).toBe(rect.y);
    }
    expect(firstAnchor.getBoundingClientRect().height).toBe(96); // Reopening cannot reuse a stale snapshot.
    const count = update.mock.calls.length;
    viewport.offsetTop = 40; viewport.height = 320; tick(); expect(update).toHaveBeenCalledTimes(count + 1);
    viewport.width = 667; viewport.height = 375; tick(); expect(update).toHaveBeenCalledTimes(count + 2);
    stop(); expect(cancel).toHaveBeenCalledWith(12);
  });
  it("keeps the editor mounted, uses fixed viewport positioning, and preserves draft focus for pointer opening", () => {
    const input = {} as HTMLTextAreaElement;
    vi.stubGlobal("document", { activeElement: input });
    const props = { anchor: { current: null }, inputRef: { current: input }, open: false,
      onOpenChange: vi.fn(), label: "模型", children: <div>模型选择</div> };
    const s = hookSession(() => ComposerToolsMenu(props));
    const popup = find(s.render(), PopoverContent).props;
    expect(popup.keepMounted).toBe(true); expect(popup.positionMethod).toBe("fixed");
    expect(popup.anchor).toBe(props.anchor); expect(popup.sideOffset).toBe(12);
    expect(popup.collisionAvoidance).toEqual({ side: "none", align: "shift", fallbackAxisSide: "none" });
    expect(popup.initialFocus instanceof Function && popup.initialFocus("keyboard")).toBe(true);
    expect(popup.initialFocus instanceof Function && popup.initialFocus("touch")).toBe(false);
    expect(popup.finalFocus instanceof Function && popup.finalFocus("touch")).toBe(false);
    const preventDefault = vi.fn();
    find(s.render(), PopoverTrigger).props.onPointerDown?.({ preventDefault } as never);
    expect(preventDefault).toHaveBeenCalledOnce();
    vi.stubGlobal("document", { activeElement: null });
    find(s.render(), PopoverTrigger).props.onPointerDown?.({ preventDefault } as never);
    expect(preventDefault).toHaveBeenCalledOnce(); s.commit(); s.dispose();
  });
});
