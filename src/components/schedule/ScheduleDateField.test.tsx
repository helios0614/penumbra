import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScheduleDateField } from "./ScheduleDateField";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>(); return { ...actual, useState: vi.fn(actual.useState) };
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T, predicate = (_props: Record<string, unknown>) => true) {
  const element = elements(node).find((child) => child.type === type && predicate(child.props));
  if (!element) throw new Error(`Missing ${String(type)}`); return element as React.ReactElement<React.ComponentProps<T>>;
}
function calendar(node: React.ReactNode) {
  const props = find(node, Calendar).props;
  if (props.mode !== "single") throw new Error("Expected single date selection");
  return props;
}
function setup(patch: Partial<React.ComponentProps<typeof ScheduleDateField>> = {}) {
  const onChange = vi.fn(), values: unknown[] = []; let cursor = 0;
  const props = { id: "test-date", label: "提醒日期", value: "2026-10-19", timeZone: "Europe/Paris", disabled: false, onChange, ...patch };
  const render = () => {
    cursor = 0; let tree: React.ReactNode;
    const spy = vi.spyOn(React, "useState").mockImplementation(((initial: unknown) => {
      const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
      return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
    }) as typeof React.useState);
    function Capture() { tree = ScheduleDateField(props); return null; }
    try { renderToStaticMarkup(<Capture />); return tree; } finally { spy.mockRestore(); }
  };
  const open = () => find(render(), Popover).props.onOpenChange?.(true, {} as never);
  const select = (date?: Date) => (calendar(render()).onSelect as (date?: Date) => void)?.(date);
  return { render, open, select, onChange };
}

describe("schedule's existing Calendar/Popover composition", () => {
  it("opens the saved calendar date without silently filling a different date", () => {
    const s = setup(); s.open(); const tree = s.render(), selectedCalendar = calendar(tree);
    expect(selectedCalendar.mode).toBe("single"); expect(selectedCalendar.selected).toEqual(new Date(2026, 9, 19, 12));
    expect(find(tree, Popover).props.open).toBe(true); expect(s.onChange).not.toHaveBeenCalled();
    expect(find(tree, PopoverTrigger).props["aria-label"]).toBe("提醒日期，2026-10-19");
    expect(find(tree, PopoverContent).props.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(find(tree, PopoverContent).props.className).toContain("max-h-(--available-height)");
    expect(find(tree, PopoverContent).props.className).toContain("overflow-auto");
  });
  it("uses server-local today for the empty alarm calendar's initial month without selecting it", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T00:30:00Z"));
    const s = setup({ value: "", timeZone: "America/Los_Angeles" }); s.open(); const selectedCalendar = calendar(s.render());
    expect(selectedCalendar.month?.getMonth()).toBe(9); expect(selectedCalendar.today?.getDate()).toBe(31); expect(selectedCalendar.selected).toBeUndefined();
    expect(s.onChange).not.toHaveBeenCalled();
  });
  it("returns an explicit date-only key with no ISO/UTC conversion", () => {
    const s = setup(); const date = new Date(2027, 1, 28, 12);
    vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => { throw new Error("No UTC conversion"); });
    s.open(); s.select(undefined); expect(s.onChange).not.toHaveBeenCalled();
    s.select(date); expect(s.onChange).toHaveBeenCalledExactlyOnceWith("2027-02-28"); expect(find(s.render(), Popover).props.open).toBe(false);
  });
  it("can browse months and dismiss without committing a date", () => {
    const s = setup(); s.open(); find(s.render(), Button, (props) => props["aria-label"] === "下个月").props.onClick?.({} as never);
    expect(find(s.render(), Calendar).props.month?.getMonth()).toBe(10);
    find(s.render(), Button, (props) => props["aria-label"] === "上个月").props.onClick?.({} as never);
    expect(find(s.render(), Calendar).props.month?.getMonth()).toBe(9);
    find(s.render(), Popover).props.onOpenChange?.(false, {} as never); expect(s.onChange).not.toHaveBeenCalled();
    s.open(); expect(calendar(s.render()).selected).toEqual(new Date(2026, 9, 19, 12));
  });
  it("supports clearing an optional date and preserves early years as date-only values", () => {
    const s = setup({ value: "0001-01-01" }); s.open(); expect(calendar(s.render()).selected?.getFullYear()).toBe(1);
    find(s.render(), Button, (props) => props.children === "清除日期").props.onClick?.({} as never);
    expect(s.onChange).toHaveBeenCalledExactlyOnceWith(""); expect(find(s.render(), Popover).props.open).toBe(false);
  });
  it("blocks disabled selection and does not substitute a browser zone for an invalid server zone", () => {
    const s = setup({ disabled: true }); s.open(); expect(find(s.render(), Popover).props.open).toBe(false);
    s.select(new Date(2027, 1, 28, 12)); expect(s.onChange).not.toHaveBeenCalled();
    const invalid = setup({ value: "", timeZone: "invalid/zone" }); invalid.open();
    expect(find(invalid.render(), PopoverTrigger).props.disabled).toBe(true); expect(find(invalid.render(), Popover).props.open).toBe(false);
  });
});
