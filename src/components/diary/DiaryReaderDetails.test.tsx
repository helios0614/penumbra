import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiaryReaderKeywords, DiaryReaderPaper, DiaryReaderTags, diaryKeywordReturnFocus, observeDiaryKeywordOverflow, trackDiaryReaderDialogViewport, trackDiaryReaderViewport } from "./DiaryReaderDetails";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef), useLayoutEffect: vi.fn(actual.useLayoutEffect) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function find(node: React.ReactNode, type: unknown): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return;
  if (node.type === type) return node;
  for (const child of React.Children.toArray(node.props.children as React.ReactNode)) {
    const match = find(child, type); if (match) return match;
  }
}

function geometry() {
  const word = { scrollWidth: 80, clientWidth: 80 };
  const strip = { scrollHeight: 26, clientHeight: 26, children: [word] };
  const observers: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(public callback: () => void) { observers.push(this); }
  });
  return { word, strip: strip as unknown as HTMLUListElement, observers };
}

function session() {
  const geometryState = geometry(), values: unknown[] = [];
  let cursor = 0, cleanup: (() => void) | undefined;
  const render = (keywords: readonly string[]) => {
    cursor = 0;
    vi.mocked(React.useRef).mockReturnValue({ current: geometryState.strip });
    vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (next: unknown) => { values[index] = next; }];
    }) as typeof React.useState);
    let effect: (() => void | (() => void)) | undefined;
    vi.mocked(React.useLayoutEffect).mockImplementation(((next: () => void | (() => void), deps: readonly unknown[]) => {
      const index = cursor++, previous = values[index] as readonly unknown[] | undefined;
      if (!previous || deps.some((dep, index) => dep !== previous[index])) { values[index] = deps; effect = next; }
    }) as typeof React.useLayoutEffect);
    const tree = DiaryReaderKeywords({ keywords });
    if (effect) { cleanup?.(); cleanup = effect() || undefined; }
    return tree;
  };
  return { ...geometryState, render, dispose: () => cleanup?.() };
}

describe("Diary bounded keyword viewing", () => {
  it("detects both extra rows and an ellipsized single keyword, responding to size changes", () => {
    const { strip, word, observers } = geometry(), update = vi.fn();
    const dispose = observeDiaryKeywordOverflow(strip, update);
    expect(update).toHaveBeenLastCalledWith(false);
    expect(observers[0].observe.mock.calls.map(([node]) => node)).toEqual([strip, word]);
    Object.assign(strip, { scrollHeight: 90, clientHeight: 58 }); observers[0].callback(); expect(update).toHaveBeenLastCalledWith(true);
    Object.assign(strip, { scrollHeight: 26, clientHeight: 26 }); Object.assign(word, { scrollWidth: 600 });
    observers[0].callback(); expect(update).toHaveBeenLastCalledWith(true);
    Object.assign(word, { scrollWidth: 80 }); observers[0].callback(); expect(update).toHaveBeenLastCalledWith(false);
    dispose(); expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it("opens all saved keywords in order and closes through the shared modal contract", () => {
    const s = session(), keywords = ["上下文交接", "shared_moment", "猫🐈", "长词".repeat(300), ...Array.from({ length: 60 }, (_, index) => `关键词${index}`)];
    let tree = s.render(keywords);
    expect(find(tree, Dialog)?.props.open).toBe(false);
    const trigger = find(tree, DialogTrigger);
    expect(trigger?.props["aria-label"]).toBe(`查看全部关键词，共${keywords.length}项`);
    const body = find(tree, DialogBody);
    const full = renderToStaticMarkup(body!.props.children as React.ReactElement);
    for (const word of keywords) expect(full).toContain(word);
    expect(full.indexOf("上下文交接")).toBeLessThan(full.indexOf("shared_moment"));
    expect(full.indexOf("shared_moment")).toBeLessThan(full.indexOf("猫🐈"));
    expect(full).not.toContain("共同经历"); expect(full).not.toMatch(/line-clamp|truncate/);
    expect(find(tree, DialogContent)?.props.closeButtonProps).toMatchObject({ "aria-label": "关闭全部关键词" });
    expect(find(tree, DialogFooter)).toBeDefined(); expect(find(tree, DialogClose)?.props.children).toBe("关闭");
    // Base UI delivers keyboard/trigger open, Escape, X and Close through this callback.
    const change = find(tree, Dialog)!.props.onOpenChange as (next: boolean) => void;
    change(true); tree = s.render(keywords); expect(find(tree, Dialog)?.props.open).toBe(true);
    change(false); tree = s.render(keywords); expect(find(tree, Dialog)?.props.open).toBe(false);
    s.dispose();
  });

  it("updates overflow without resetting an open dialog and cleans up on data change and unmount", () => {
    const s = session(), words = ["一", "二", "三"], tree = s.render(words);
    (find(tree, Dialog)!.props.onOpenChange as (next: boolean) => void)(true);
    Object.assign(s.strip, { scrollHeight: 120, clientHeight: 58 }); s.observers[0].callback();
    const changed = s.render(words);
    expect(find(changed, Dialog)?.props.open).toBe(true);
    expect(renderToStaticMarkup(changed)).toContain('data-overflow="true"');
    s.render([...words, "四"]); expect(s.observers[0].disconnect).toHaveBeenCalledOnce();
    s.dispose(); expect(s.observers[1].disconnect).toHaveBeenCalledOnce();
  });

  it("omits empty metadata and retains all tags for a bounded preview and full view", () => {
    const s = session(); expect(s.render([])).toBeNull(); s.dispose();
    expect(DiaryReaderTags({ tags: [] })).toBeNull();
    const tags = ["shared_moment", "emotion", "__proto__", "分类".repeat(200), ...Array.from({ length: 80 }, (_, index) => `标签${index}`)];
    for (const full of [false, true]) {
      const html = renderToStaticMarkup(<DiaryReaderTags tags={tags} full={full} />);
      expect(html).toContain("共同经历"); expect(html).toContain("情感时刻"); expect(html).toContain("__proto__");
      expect(html).toContain(tags[3]); expect(html).toContain("标签79"); expect(html).not.toContain("<button");
      if (full) expect(html).toContain("diary-reader-chip-full");
    }
  });

  it("returns focus to the visible keyword trigger after a resize, with Edit as the fallback", () => {
    const regular = { visible: true, visibility: "visible", getClientRects() { return this.visible ? [{}] : []; } };
    const compact = { ...regular, visible: false }, info = { focus: vi.fn() };
    vi.stubGlobal("window", { getComputedStyle: (node: typeof regular) => ({ visibility: node.visibility }) });
    const footer = { querySelectorAll: () => [regular, compact], closest: () => ({ querySelector: (selector: string) => { expect(selector).toBe("[data-diary-edit-trigger]"); return info; } }) };
    const strip = { closest: () => footer } as unknown as HTMLElement;
    expect(diaryKeywordReturnFocus(strip)).toBe(regular);
    regular.visible = false; compact.visible = true; expect(diaryKeywordReturnFocus(strip)).toBe(compact);
    compact.visible = false; expect(diaryKeywordReturnFocus(strip)).toBe(info);
    regular.visible = true; regular.visibility = "hidden"; expect(diaryKeywordReturnFocus(strip)).toBe(info);
    expect(diaryKeywordReturnFocus(null)).toBe(true);
  });
});

describe("Diary reader local visible viewport", () => {
  function style() {
    const properties = new Map<string, string>();
    return { properties, style: { setProperty: (key: string, value: string) => properties.set(key, value), removeProperty: (key: string) => properties.delete(key) } };
  }

  it("bounds paper below the fixed header when only visualViewport shrinks and cleans up listeners", () => {
    const { observers } = geometry(), { properties, style: paperStyle } = style();
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const host = Object.assign(new EventTarget(), { getComputedStyle: () => ({ paddingBottom: "16px" }) });
    vi.stubGlobal("window", host);
    let top = 180;
    const parent = { firstElementChild: {} }, paper = { parentElement: parent, style: paperStyle, getBoundingClientRect: () => ({ top }) } as unknown as HTMLElement;
    const stop = trackDiaryReaderViewport(paper, viewport as VisualViewport);
    expect(properties.get("--diary-reader-available-height")).toBe("604px");
    viewport.height = 380; viewport.dispatchEvent(new Event("resize")); expect(properties.get("--diary-reader-available-height")).toBe("184px");
    viewport.offsetTop = 20; viewport.dispatchEvent(new Event("scroll")); expect(properties.get("--diary-reader-available-height")).toBe("204px");
    top = 200; host.dispatchEvent(new Event("resize")); expect(properties.get("--diary-reader-available-height")).toBe("184px");
    top = 220; observers[0].callback(); expect(properties.get("--diary-reader-available-height")).toBe("164px");
    top = 900; observers[0].callback(); expect(properties.get("--diary-reader-available-height")).toBe("0px");
    expect(observers[0].observe.mock.calls.map(([node]) => node)).toEqual([parent, parent.firstElementChild]);
    stop(); expect(properties.size).toBe(0); expect(observers[0].disconnect).toHaveBeenCalledOnce();
    viewport.dispatchEvent(new Event("resize")); viewport.dispatchEvent(new Event("scroll")); host.dispatchEvent(new Event("resize"));
    expect(properties.size).toBe(0);
    trackDiaryReaderViewport(paper, null)(); expect(properties.size).toBe(0);
  });

  it("keeps open information dialogs inside the visible viewport without changing shared styles", () => {
    const { properties, style: popupStyle } = style(), popup = { style: popupStyle } as unknown as HTMLElement;
    const viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0 });
    const stop = trackDiaryReaderDialogViewport(popup, viewport as VisualViewport);
    expect(properties.get("--dialog-viewport-height")).toBe("700px");
    viewport.height = 300; viewport.offsetTop = 40; viewport.dispatchEvent(new Event("resize"));
    expect(properties.get("--dialog-viewport-height")).toBe("300px"); expect(properties.get("--dialog-viewport-top")).toBe("40px");
    viewport.offsetTop = 60; viewport.dispatchEvent(new Event("scroll")); expect(properties.get("--dialog-viewport-top")).toBe("60px");
    stop(); viewport.dispatchEvent(new Event("resize")); expect(properties.size).toBe(0);
    trackDiaryReaderDialogViewport(popup, null)(); expect(properties.size).toBe(0);
  });

  it("forwards the actual paper element to the existing navigation focus ref", () => {
    const own = { current: null }, external = React.createRef<HTMLElement>();
    vi.mocked(React.useRef).mockReturnValue(own);
    vi.spyOn(React, "useCallback").mockImplementation((callback) => callback);
    vi.mocked(React.useLayoutEffect).mockImplementation(() => {});
    const tree = DiaryReaderPaper({ readerRef: external, children: "body" });
    const bind = tree.props.ref as (node: HTMLElement | null) => void, paper = { focus: vi.fn() } as unknown as HTMLElement;
    bind(paper); expect(external.current).toBe(paper); expect(own.current).toBe(paper);
    external.current?.focus({ preventScroll: true }); expect(paper.focus).toHaveBeenCalledWith({ preventScroll: true });
    bind(null); expect(external.current).toBeNull();
  });
});
