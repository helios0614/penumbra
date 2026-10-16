import { describe, expect, it, vi } from "vitest";
import { trackQuickNoteDialogViewport } from "./quick-note-dialog-viewport";

describe("Quick Note dialog visual viewport", () => {
  it("follows keyboard resize and viewport pan in place, then removes listeners on close", () => {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const properties = new Map<string, string>();
    const style = {
      setProperty: vi.fn((key: string, value: string) => properties.set(key, value)),
      removeProperty: vi.fn((key: string) => properties.delete(key)),
    } as unknown as CSSStyleDeclaration;
    const stop = trackQuickNoteDialogViewport({ style }, viewport);
    expect(properties.get("--quick-note-viewport-height")).toBe("800px");
    viewport.height = 360;
    viewport.offsetTop = 80;
    viewport.dispatchEvent(new Event("resize"));
    expect(properties.get("--quick-note-viewport-height")).toBe("360px");
    expect(properties.get("--quick-note-viewport-top")).toBe("80px");
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event("scroll"));
    expect(properties.get("--quick-note-viewport-top")).toBe("120px");
    stop();
    expect(properties.size).toBe(0);
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    expect(properties.size).toBe(0);
    // Reopening gets fresh geometry rather than the closed keyboard's height.
    viewport.height = 800;
    const stopAgain = trackQuickNoteDialogViewport({ style }, viewport);
    expect(properties.get("--quick-note-viewport-height")).toBe("800px");
    stopAgain();
  });

  it("leaves the dvh CSS fallback intact without VisualViewport support", () => {
    const style = { setProperty: vi.fn(), removeProperty: vi.fn() } as unknown as CSSStyleDeclaration;
    trackQuickNoteDialogViewport({ style }, null)();
    expect(style.setProperty).not.toHaveBeenCalled();
    expect(style.removeProperty).not.toHaveBeenCalled();
  });
});
