import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityController } from "@/application/activity/activity-controller";
import { INITIAL_ACTIVITY_STATE, type ActivityState } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityReadIssue } from "./ActivityFeedback";
import { ActivityControls } from "./ActivityControls";

// Exercise real component callbacks and composition without a browser or DOM.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
afterEach(() => vi.restoreAllMocks());

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.type === ActivityReadIssue ? ActivityReadIssue(child.props as React.ComponentProps<typeof ActivityReadIssue>) : child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}
function button(node: React.ReactNode, label: string) {
  const element = elements(node).find((child) => child.type === Button && child.props.children === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element as React.ReactElement<React.ComponentProps<typeof Button>>;
}
function click(node: React.ReactNode, label: string) {
  button(node, label).props.onClick?.({} as never);
}
function setup(dates: readonly string[] = ["2026-10-17"]) {
  let state: ActivityState = { ...INITIAL_ACTIVITY_STATE, dates: { data: dates, loading: false, error: null } };
  const selectQuery = vi.fn(async (query: ActivityState["query"]) => { state = { ...state, query }; });
  const loadDates = vi.fn(async () => {});
  const selectDevice = vi.fn((device: ActivityState["device"]) => { state = { ...state, device }; });
  const controller = { selectQuery, loadDates, selectDevice } as unknown as ActivityController;
  const values: unknown[] = [];
  let cursor = 0;
  const useState = ((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  }) as typeof React.useState;
  const render = () => {
    cursor = 0;
    const spy = vi.spyOn(React, "useState").mockImplementation(useState);
    try { return ActivityControls({ state, controller }); } finally { spy.mockRestore(); }
  };
  const triggerText = () => renderToStaticMarkup(<>{find(render(), PopoverTrigger).props.children as React.ReactNode}</>).replace(/<[^>]*>/g, "");
  const open = () => { find(render(), Popover).props.onOpenChange?.(true, {} as never); };
  return { render, open, triggerText, selectQuery, loadDates, selectDevice, state: () => state, update: (patch: Partial<ActivityState>) => { state = { ...state, ...patch }; } };
}

describe("Unified activity time selection", () => {
  it("has one range trigger for recent and archive queries with no secondary date button", () => {
    for (const query of [{ kind: "recent", hours: 3 }, { kind: "date", date: "2026-10-17" }] as const) {
      const html = renderToStaticMarkup(<TooltipProvider><ActivityControls state={{ ...INITIAL_ACTIVITY_STATE, query }} controller={null} /></TooltipProvider>);
      expect(html.match(/data-slot="popover-trigger"/g)).toHaveLength(1);
      expect(html.match(/aria-label="活动时间范围"/g)).toHaveLength(1);
      expect(html).not.toContain("select-trigger"); expect(html).not.toContain("选择日志归档日期");
      expect(html).toContain(query.kind === "recent" ? "最近 3 小时" : query.date);
      expect(html).toContain('aria-label="活动设备筛选"');
    }
  });
  it("directly selects the only real archive key without guessing today or opening a calendar", () => {
    const s = setup(["2001-02-03"]);
    expect(s.triggerText()).toBe("最近 3 小时");
    s.open(); expect(s.loadDates).toHaveBeenCalledOnce();
    click(s.render(), "归档日期");
    expect(s.selectQuery).toHaveBeenCalledWith({ kind: "date", date: "2001-02-03" });
    expect(find(s.render(), Popover).props.open).toBe(false);
    expect(elements(s.render()).some((element) => element.type === Calendar)).toBe(false);
    expect(s.triggerText()).toBe("2001-02-03");
    s.open(); click(s.render(), "最近 3 小时");
    expect(s.selectQuery).toHaveBeenLastCalledWith({ kind: "recent", hours: 3 }); expect(s.triggerText()).toBe("最近 3 小时");
  });
  it("offers only recent and archive choices without classifying the newest file as today", () => {
    const s = setup(["2026-10-17", "2026-10-16"]);
    const labels = elements(find(s.render(), PopoverContent).props.children).filter((element) => element.type === Button).map((element) => element.props.children);
    expect(labels).toEqual(["最近 3 小时", "归档日期"]);
    click(s.render(), "归档日期"); expect(s.selectQuery).not.toHaveBeenCalled();
    expect(elements(s.render()).filter((element) => element.type === PopoverTrigger)).toHaveLength(1);
    expect(find(s.render(), Calendar)).toBeDefined();
  });
  it("allows only listed archive keys in the calendar and passes the chosen date unchanged", () => {
    const s = setup(["2026-10-17", "2026-10-15"]); s.open(); click(s.render(), "归档日期");
    const calendar = find(s.render(), Calendar);
    if (calendar.props.mode !== "single") throw new Error("expected single-date calendar");
    const disabled = calendar.props.disabled as (date: Date) => boolean;
    expect(disabled(new Date(2026, 9, 17, 12))).toBe(false);
    expect(disabled(new Date(2026, 9, 15, 12))).toBe(false);
    expect(disabled(new Date(2026, 9, 16, 12))).toBe(true);
    const select = calendar.props.onSelect as (date: Date | undefined) => void;
    select(undefined); select(new Date(2026, 9, 16, 12)); expect(s.selectQuery).not.toHaveBeenCalled();
    select(new Date(2026, 9, 15, 12));
    expect(s.selectQuery).toHaveBeenCalledWith({ kind: "date", date: "2026-10-15" });
    expect(s.triggerText()).toBe("2026-10-15"); expect(find(s.render(), Popover).props.open).toBe(false);
  });
  it("retains archive selection when opening and backing out of the calendar", () => {
    const s = setup(["2026-10-17", "2026-09-30"]);
    s.update({ query: { kind: "date", date: "2026-09-30" }, device: "phone" });
    s.open(); click(s.render(), "归档日期");
    expect(find(s.render(), Calendar).props.month).toEqual(new Date(2026, 8, 30, 12));
    const back = elements(s.render()).find((element) => element.type === Button && renderToStaticMarkup(element).includes("时间范围"))!;
    (back.props.onClick as () => void)();
    expect(s.triggerText()).toBe("2026-09-30"); expect(s.selectQuery).not.toHaveBeenCalled(); expect(s.state().device).toBe("phone");
  });
  it("rechecks changed availability, warns about a removed selection and lets the user return to recent", () => {
    const s = setup(["2026-10-17", "2026-10-16"]); s.update({ query: { kind: "date", date: "2026-10-16" }, device: "pc" });
    s.open(); click(s.render(), "归档日期");
    s.update({ dates: { data: ["2026-10-17"], loading: false, error: null } });
    const html = renderToStaticMarkup(<TooltipProvider>{s.render()}</TooltipProvider>);
    expect(html).toContain("所选归档已不在可用日期中"); expect(s.triggerText()).toBe("2026-10-16");
    const calendar = find(s.render(), Calendar);
    if (calendar.props.mode !== "single") throw new Error("expected single-date calendar");
    expect((calendar.props.disabled as (date: Date) => boolean)(new Date(2026, 9, 16, 12))).toBe(true);
    (calendar.props.onSelect as (date: Date) => void)(new Date(2026, 9, 16, 12)); expect(s.selectQuery).not.toHaveBeenCalled();
    click(s.render(), "回到最近活动");
    expect(s.selectQuery).toHaveBeenLastCalledWith({ kind: "recent", hours: 3 }); expect(s.state().device).toBe("pc");
  });
  it("does not use missing, loading or failed date data to invent an archive or report a deletion", () => {
    const s = setup([]); s.update({ query: { kind: "date", date: "2026-10-16" } });
    for (const dates of [{ data: null, loading: true, error: null }, { data: ["2026-10-17"], loading: true, error: null }, { data: ["2026-10-17"], loading: false, error: "离线" }, { data: [], loading: false, error: null }]) {
      s.update({ dates });
      expect(button(s.render(), "归档日期").props.disabled).toBe(true);
      click(s.render(), "归档日期"); expect(s.selectQuery).not.toHaveBeenCalled();
      const html = renderToStaticMarkup(<TooltipProvider>{s.render()}</TooltipProvider>);
      if (dates.data === null || dates.loading || dates.error) expect(html).not.toContain("可能已被清理");
      if (dates.error) {
        const popup = renderToStaticMarkup(<TooltipProvider>{find(s.render(), PopoverContent).props.children as React.ReactNode}</TooltipProvider>);
        expect(popup).toContain("重新读取日期");
        click(find(s.render(), PopoverContent), "重新读取日期");
        expect(s.loadDates).toHaveBeenCalled();
      }
      s.open();
    }
    click(s.render(), "最近 3 小时"); expect(s.selectQuery).toHaveBeenLastCalledWith({ kind: "recent", hours: 3 });
  });
});
