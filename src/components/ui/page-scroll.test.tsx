import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { observePageScroll, scrollPageToTop, showPageTopButton } from "./page-scroll";
import { PageScrollArea, PageTopButton } from "./page-scroll-area";
import { toastGeometry } from "./toast-viewport";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef), useEffect: vi.fn(actual.useEffect) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function region() {
  return Object.assign(new EventTarget(), { scrollTop: 0, clientHeight: 480, focus: vi.fn(), scrollTo: vi.fn() }) as unknown as HTMLDivElement;
}
function resizeStub() {
  const instances: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(public callback: () => void) { instances.push(this); }
  });
  return instances;
}

// Execute hook lifetimes against EventTarget, without browser automation.
function session() {
  const target = region(), ref = { current: target }, values: unknown[] = [];
  let cursor = 0, cleanup: (() => void) | undefined;
  const render = (props: Partial<React.ComponentProps<typeof PageScrollArea>> = {}) => {
    cursor = 0;
    vi.spyOn(React, "useRef").mockReturnValue(ref);
    vi.spyOn(React, "useState").mockImplementation(((initial: unknown) => {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (next: unknown) => { values[index] = next; }];
    }) as typeof React.useState);
    let effect: (() => void | (() => void)) | undefined;
    vi.spyOn(React, "useEffect").mockImplementation(((next: () => void | (() => void), deps: readonly unknown[]) => {
      const index = cursor++, previous = values[index] as readonly unknown[] | undefined;
      if (!previous || deps.some((dep, n) => dep !== previous[n])) { values[index] = deps; effect = next; }
    }) as typeof React.useEffect);
    const tree = PageScrollArea({ label: "页面内容", topLabel: "回到页面顶部", children: "内容", ...props });
    if (effect) { cleanup?.(); cleanup = effect() || undefined; }
    return tree;
  };
  const visible = (tree: ReturnType<typeof render>) => tree.props.children[1].props.visible;
  return { target, render, visible, dispose: () => cleanup?.() };
}

describe("shared page scrolling", () => {
  it("preserves Activity's substantial threshold at different viewport heights", () => {
    expect([0, 100, 720, 721, 1000, 120, 0].map((top) => showPageTopButton(top, 480))).toEqual([false, false, false, true, true, false, false]);
    expect(showPageTopButton(1350, 900)).toBe(false);
    expect(showPageTopButton(1351, 900)).toBe(true);
    expect(showPageTopButton(1000, 0)).toBe(false);
  });
  it("listens only to its owner, responds to resize, and cleans up before reentry", () => {
    const observers = resizeStub(), target = region(), other = region(), update = vi.fn();
    const remove = vi.spyOn(target, "removeEventListener");
    const dispose = observePageScroll(target, update);
    expect(update).toHaveBeenLastCalledWith(false);
    other.scrollTop = 900; other.dispatchEvent(new Event("scroll")); expect(update).toHaveBeenCalledTimes(1);
    target.scrollTop = 900; target.dispatchEvent(new Event("scroll")); expect(update).toHaveBeenLastCalledWith(true);
    Object.assign(target, { clientHeight: 800 }); observers[0].callback(); expect(update).toHaveBeenLastCalledWith(false);
    dispose(); expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function)); expect(observers[0].disconnect).toHaveBeenCalledOnce();
    update.mockClear(); target.dispatchEvent(new Event("scroll")); expect(update).not.toHaveBeenCalled();
    const again = observePageScroll(target, update);
    update.mockClear(); target.dispatchEvent(new Event("scroll")); expect(update).toHaveBeenCalledOnce(); again();
  });
  it.each([false, true])("focuses and scrolls only the bound content, reduced motion = %s", (reduced) => {
    const target = region(), other = region();
    scrollPageToTop(target, reduced);
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reduced ? "instant" : "smooth" });
    expect(other.scrollTo).not.toHaveBeenCalled(); expect(() => scrollPageToTop(null, reduced)).not.toThrow();
  });
  it("preserves ordinary updates and resets only when the feature's reset key changes", () => {
    const observers = resizeStub(), s = session(); s.render({ resetKey: "date:all" });
    s.target.scrollTop = 900; s.target.dispatchEvent(new Event("scroll"));
    expect(s.visible(s.render({ resetKey: "date:all" }))).toBe(true);
    expect(s.target.scrollTop).toBe(900); expect(observers).toHaveLength(1);
    s.render({ resetKey: "date:phone" }); expect(s.target.scrollTop).toBe(0);
    expect(s.visible(s.render({ resetKey: "date:phone" }))).toBe(false);
    expect(observers[0].disconnect).toHaveBeenCalledOnce(); s.dispose();
  });
  it("detaches while the overview is hidden and re-reads its restored position", () => {
    const observers = resizeStub(), s = session(); s.render();
    s.target.scrollTop = 900; s.target.dispatchEvent(new Event("scroll")); expect(s.visible(s.render())).toBe(true);
    expect(s.visible(s.render({ hidden: true }))).toBe(false); expect(observers[0].disconnect).toHaveBeenCalledOnce();
    s.target.scrollTop = 120; s.render({ syncKey: "restored" }); expect(s.target.scrollTop).toBe(120);
    expect(s.visible(s.render({ syncKey: "restored" }))).toBe(false); s.dispose();
  });
  it("uses the external navigation ref and passes reduced motion to the click action", () => {
    resizeStub(); const s = session(), external = region(); external.scrollTop = 900;
    const props = { scrollRef: { current: external } }; s.render(props); const tree = s.render(props);
    expect(s.visible(tree)).toBe(true); vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    tree.props.children[1].props.onClick();
    expect(external.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" }); expect(s.target.scrollTo).not.toHaveBeenCalled(); s.dispose();
  });
  it("exposes a named keyboard target and reserves Toast space without changing its queue", () => {
    expect(renderToStaticMarkup(<PageTopButton visible={false} label="回顶" onClick={vi.fn()} />)).toBe("");
    const click = vi.fn(), tree = PageTopButton({ visible: true, label: "回到定位顶部", onClick: click });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-label="回到定位顶部"'); expect(html).toContain('title="回到定位顶部"');
    expect(html).toContain('data-toast-obstacle="true"'); expect(html).toContain("mist-glass");
    tree?.props.onClick?.({} as never); expect(click).toHaveBeenCalledOnce();
    expect(toastGeometry({ left: 0, top: 0, width: 390, height: 800 }, undefined, 16, 720)["--toast-clearance"]).toBe("92px");
  });
  it("hides native/drawn bars without disabling scrolling, and suppresses floats for modals", () => {
    const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.scrollbar-none\s*\{[^}]*scrollbar-width: none;[^}]*-ms-overflow-style: none;/);
    expect(css).toMatch(/\.scrollbar-none::-webkit-scrollbar\s*\{[^}]*display: none;[^}]*height: 0;/);
    expect(css.match(/\.scrollbar-none\s*\{[^}]*\}/)?.[0]).not.toContain("overflow:");
    expect(css).toMatch(/\[data-slot="scroll-area-scrollbar"\],[\s\S]*?display: none/);
    expect(css).toMatch(/body:has\([^\n]*aria-modal[^\n]*\) \.page-back-to-top\s*\{[^}]*visibility: hidden/);
    expect(css).toContain('.page-scroll-region[data-back-to-top="true"]');
  });
});
