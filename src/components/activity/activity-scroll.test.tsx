import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_ACTIVITY_STATE, type ActivityState } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";
import { ActivityTopButton, ActivityView } from "./ActivityView";
import { scrollActivityToTop, showActivityTopButton } from "./activity-scroll";
import * as hooks from "./useActivity";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef), useEffect: vi.fn(actual.useEffect) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}

// In-memory hook state and a scroll-region stub; no browser or DOM automation.
function viewSession() {
  let state: ActivityState = INITIAL_ACTIVITY_STATE, cursor = 0;
  const values: unknown[] = [], effects: (() => void)[] = [];
  const region = { scrollTop: 0, clientHeight: 480, scrollTo: vi.fn(), focus: vi.fn() };
  vi.spyOn(hooks, "useActivity").mockImplementation(() => ({ state, controller: null, connection: "connected", reconnect: vi.fn() }));
  const useState = ((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  }) as typeof React.useState;
  const useEffect = ((effect: () => void, deps: readonly unknown[]) => {
    const index = cursor++, previous = values[index] as readonly unknown[] | undefined;
    if (!previous || deps.some((dep, n) => dep !== previous[n])) { values[index] = deps; effects.push(effect); }
  }) as typeof React.useEffect;
  const render = () => {
    cursor = 0;
    const spies = [vi.spyOn(React, "useState").mockImplementation(useState), vi.spyOn(React, "useRef").mockReturnValue({ current: region }), vi.spyOn(React, "useEffect").mockImplementation(useEffect)];
    try { return ActivityView({}); } finally { spies.forEach((spy) => spy.mockRestore()); effects.splice(0).forEach((effect) => effect()); }
  };
  const topButton = () => elements(render()).find((element) => element.type === ActivityTopButton) as React.ReactElement<React.ComponentProps<typeof ActivityTopButton>>;
  const scroll = (top: number) => {
    region.scrollTop = top;
    const area = elements(render()).find((element) => element.props["aria-label"] === "活动日志页面内容")!;
    (area.props.onScroll as (event: { currentTarget: typeof region }) => void)({ currentTarget: region });
  };
  return { render, region, topButton, scroll, update: (patch: Partial<ActivityState>) => { state = { ...state, ...patch }; } };
}

describe("Activity back-to-top", () => {
  it("waits for substantial scrolling instead of showing for minor overflow", () => {
    expect([0, 1, 100, 360, 720, 721, 1000, 120, 0].map((top) => showActivityTopButton(top, 480))).toEqual([false, false, false, false, false, true, true, false, false]);
    expect(showActivityTopButton(1200, 900)).toBe(false);
    expect(showActivityTopButton(1350, 900)).toBe(false); expect(showActivityTopButton(1351, 900)).toBe(true);
    expect(showActivityTopButton(1000, 0)).toBe(false);
  });
  it("uses the Quick Note floating-button styling and an accessible activity label", () => {
    expect(renderToStaticMarkup(<ActivityTopButton visible={false} onClick={vi.fn()} />)).toBe("");
    const clicked = vi.fn(), tree = ActivityTopButton({ visible: true, onClick: clicked });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("mist-glass absolute bottom-3 right-3 size-11 rounded-full");
    expect(html).toContain('aria-label="回到活动日志顶部"'); expect(html).toContain('title="回到活动日志顶部"');
    expect(tree?.type).toBe(Button); tree?.props.onClick?.({} as never); expect(clicked).toHaveBeenCalledOnce();
  });
  it.each([false, true])("scrolls and focuses only the Activity region, reduced motion = %s", (reducedMotion) => {
    const region = { scrollTo: vi.fn(), focus: vi.fn() };
    scrollActivityToTop(region, reducedMotion);
    expect(region.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(region.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    expect(() => scrollActivityToTop(null, reducedMotion)).not.toThrow();
  });
  it("updates on actual content scrolling and hides again when returning near the top", () => {
    const s = viewSession(); s.render(); expect(s.topButton().props.visible).toBe(false);
    s.scroll(720); expect(s.topButton().props.visible).toBe(false);
    s.scroll(721); expect(s.topButton().props.visible).toBe(true);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    s.topButton().props.onClick(); expect(s.region.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    s.scroll(0); expect(s.topButton().props.visible).toBe(false);
  });
  it("resets with range/device changes while ordinary snapshot updates preserve reading position", () => {
    const s = viewSession(); s.render(); s.scroll(900); expect(s.topButton().props.visible).toBe(true);
    s.update({ logs: { data: [], loading: false, error: null } }); s.render();
    expect(s.region.scrollTop).toBe(900); expect(s.topButton().props.visible).toBe(true);
    s.update({ query: { kind: "date", date: "2026-10-17" } }); s.render();
    expect(s.region.scrollTop).toBe(0); expect(s.topButton().props.visible).toBe(false);
    s.scroll(900); s.update({ device: "phone" }); s.render();
    expect(s.region.scrollTop).toBe(0); expect(s.topButton().props.visible).toBe(false);
  });
});
