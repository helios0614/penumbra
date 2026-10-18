import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { LocationTimeColumn, LocationTimeField } from "./LocationTimeField";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
afterEach(() => vi.restoreAllMocks());
const css = readFileSync(new URL("./location.css", import.meta.url), "utf8");
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}
function column(node: React.ReactNode, label: string) {
  return elements(node).find((child) => child.type === LocationTimeColumn && child.props.label === label)! as React.ReactElement<React.ComponentProps<typeof LocationTimeColumn>>;
}
// Keep only the feature's local state across callback-driven renders. No browser or Base UI simulation.
function session(render: () => React.ReactNode) {
  const values: unknown[] = []; let cursor = 0;
  const useState = ((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  }) as typeof React.useState;
  return () => {
    cursor = 0; let tree: React.ReactNode;
    const spy = vi.spyOn(React, "useState").mockImplementation(useState);
    function Capture() { tree = render(); return null; }
    try { renderToStaticMarkup(<Capture />); return tree; } finally { spy.mockRestore(); }
  };
}
const props = { id: "time-test", label: "统一时段开始", value: "08:30", disabled: false };
const open = (tree: React.ReactNode) => find(tree, Dialog).props.onOpenChange?.(true, {} as never);
const confirm = (tree: React.ReactNode) => find(find(tree, DialogFooter), Button).props.onClick?.({} as never);

describe("Location minute-precision time selection", () => {
  it("offers every hour and minute through native keyboard-accessible radio groups", () => {
    const render = session(() => LocationTimeField({ ...props, onChange: vi.fn() })); open(render()); const tree = render();
    const hours = column(tree, "小时"), minutes = column(tree, "分钟");
    expect(hours.props.options).toEqual(Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")));
    expect(minutes.props.options).toEqual(Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")));
    expect(hours.props.value).toBe("08"); expect(minutes.props.value).toBe("30");
    const html = renderToStaticMarkup(<><LocationTimeColumn {...hours.props} /><LocationTimeColumn {...minutes.props} /></>);
    expect(html.match(/type="radio"/g)).toHaveLength(84); expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2); expect(html.match(/aria-orientation="vertical"/g)).toHaveLength(2);
    expect(new Set([...html.matchAll(/name="([^"]+)"/g)].map((match) => match[1])).size).toBe(2);
    expect(html).toContain("peer-focus-visible:ring-2"); expect(html).not.toContain('type="time"');
    expect(find(tree, DialogContent).props.initialFocus).toBeTypeOf("function");
    expect(find(tree, DialogContent).props.finalFocus).toBeUndefined();
  });
  it.each(["00:00", "23:59", "12:01", "10:58"])("commits %s only on explicit confirmation", (time) => {
    const onChange = vi.fn(), render = session(() => LocationTimeField({ ...props, onChange }));
    open(render()); let tree = render();
    column(tree, "小时").props.onChange(time.slice(0, 2)); tree = render();
    column(tree, "分钟").props.onChange(time.slice(3)); tree = render();
    expect(onChange).not.toHaveBeenCalled(); confirm(tree);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(time); expect(find(render(), Dialog).props.open).toBe(false);
  });
  it("cancels without changing the field and starts from the original value on reopening", () => {
    const onChange = vi.fn(), render = session(() => LocationTimeField({ ...props, onChange }));
    open(render()); column(render(), "小时").props.onChange("23");
    const tree = render();
    expect(find(find(tree, DialogFooter), DialogClose).props.children).toBe("取消");
    find(tree, Dialog).props.onOpenChange?.(false, {} as never);
    expect(onChange).not.toHaveBeenCalled(); expect(find(render(), Dialog).props.open).toBe(false);
    open(render()); expect(column(render(), "小时").props.value).toBe("08");
  });
  it("previews an inherited value without filling an empty override or changing it on cancellation", () => {
    const onChange = vi.fn(), render = session(() => LocationTimeField({ ...props, value: "", inheritedValue: "09:25", onChange }));
    let tree = render();
    expect(find(tree, DialogTrigger).props["aria-label"]).toContain("沿用统一配置");
    expect(elements(tree).find((child) => child.type === "p")?.props.children).toBe("沿用统一 09:25");
    open(tree); tree = render(); expect(column(tree, "小时").props.value).toBe("09"); expect(column(tree, "分钟").props.value).toBe("25");
    find(tree, Dialog).props.onOpenChange?.(false, {} as never); expect(onChange).not.toHaveBeenCalled();
  });
  it("rejects invalid selections, disabled confirmation and out-of-range radio changes", () => {
    const onChange = vi.fn(); let disabled = false;
    const render = session(() => LocationTimeField({ ...props, disabled, onChange }));
    open(render()); column(render(), "小时").props.onChange("24");
    expect(find(find(render(), DialogFooter), Button).props.disabled).toBe(true); confirm(render()); expect(onChange).not.toHaveBeenCalled();
    column(render(), "小时").props.onChange("23"); column(render(), "分钟").props.onChange("60"); confirm(render()); expect(onChange).not.toHaveBeenCalled();
    column(render(), "分钟").props.onChange("59"); disabled = true; confirm(render()); expect(onChange).not.toHaveBeenCalled();
    expect(find(render(), DialogTrigger).props.disabled).toBe(true);
    const select = vi.fn(); let tree: React.ReactNode;
    function Capture() { tree = LocationTimeColumn({ label: "分钟", value: "00", options: ["00", "01"], onChange: select }); return null; }
    renderToStaticMarkup(<Capture />);
    const radio = find(tree, "input");
    radio.props.onChange?.({ currentTarget: { checked: true, value: "60" } } as never);
    radio.props.onChange?.({ currentTarget: { checked: false, value: "01" } } as never); expect(select).not.toHaveBeenCalled();
    radio.props.onChange?.({ currentTarget: { checked: true, value: "01" } } as never); expect(select).toHaveBeenCalledExactlyOnceWith("01");
  });
  it("uses a bounded two-column scroll area and an explicit cancel/confirm footer at narrow widths", () => {
    const render = session(() => LocationTimeField({ ...props, onChange: vi.fn() })), tree = render();
    expect(find(tree, DialogContent).props.className).toBe("max-w-[22rem]");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("height: min(15rem, 40dvh)"); expect(css).toContain("overscroll-behavior: contain");
    expect(find(tree, DialogFooter).props.className).toBeUndefined();
  });
});
