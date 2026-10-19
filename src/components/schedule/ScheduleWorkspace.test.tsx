import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduleController, initialScheduleState } from "@/application/schedule/schedule-controller";
import type { Schedule } from "@/domain/schedule";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControlItem } from "@/components/ui/selection-control";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SchedulePage } from "./ScheduleView";
import { ScheduleRows, ScheduleRowActions } from "./ScheduleRows";
import { ScheduleCancelDialog } from "./ScheduleCancelDialog";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef), useEffect: vi.fn(actual.useEffect), useLayoutEffect: vi.fn(actual.useLayoutEffect) };
});
vi.mock("@/components/ui/toast", async (importOriginal) => ({ ...await importOriginal<object>(), useFeedbackToast: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T, predicate = (_props: Record<string, unknown>) => true) {
  const element = elements(node).find((child) => child.type === type && predicate(child.props));
  if (!element) throw new Error(`Missing ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}
// Invoke actual callbacks with persistent hook values, without a browser or DOM simulator.
function session(render: () => React.ReactNode) {
  const values: unknown[] = [], refs: { current: unknown }[] = [], layouts: (React.DependencyList | undefined)[] = [];
  return () => {
    let stateIndex = 0, refIndex = 0, layoutIndex = 0;
    const effects: React.EffectCallback[] = [];
    const spies = [
      vi.spyOn(React, "useState").mockImplementation(((initial: unknown) => {
        const index = stateIndex++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
        return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
      }) as typeof React.useState),
      vi.spyOn(React, "useRef").mockImplementation(((initial: unknown) => refs[refIndex++] ??= { current: initial }) as typeof React.useRef),
      vi.spyOn(React, "useEffect").mockImplementation(() => {}),
      vi.spyOn(React, "useLayoutEffect").mockImplementation((effect, deps) => {
        const index = layoutIndex++, previous = layouts[index];
        if (!previous || !deps || previous.some((value, position) => value !== deps[position])) effects.push(effect);
        layouts[index] = deps;
      }),
    ];
    try { const tree = render(); effects.forEach((effect) => effect()); return tree; } finally { spies.forEach((spy) => spy.mockRestore()); }
  };
}
const item: Schedule = { id: "todo_1", kind: "todo", status: "active", content: "较长的待办 [?]", triggerAt: "2026-10-19 10:00", createdAt: 1 };
const realtime = { connection: "connected" as const, reconnect: vi.fn() };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("schedule workspace interaction", () => {
  it("resets only on TODO view changes, preserving scroll on ordinary refresh and feedback updates", () => {
    const state = { ...initialScheduleState, loaded: true, items: [item, { ...item, id: "done", status: "done" as const }] };
    const render = session(() => SchedulePage({ kind: "todo", state, controller: null, realtime }));
    const region = find(render(), "div", (props) => Boolean(props["data-schedule-list-scroll"]));
    const scroll = { scrollTop: 800 } as HTMLDivElement; (region.props.ref as React.RefObject<HTMLDivElement>).current = scroll;
    render(); expect(scroll.scrollTop).toBe(800);
    find(render(), SegmentedControlItem, (props) => props.selected === false).props.onClick?.({} as never);
    const completed = find(render(), ScheduleRows); expect(completed.props.items[0].id).toBe("done"); expect(scroll.scrollTop).toBe(0);
    scroll.scrollTop = 300; render(); expect(scroll.scrollTop).toBe(300);
    find(render(), SegmentedControlItem, (props) => props.selected === false).props.onClick?.({} as never); render(); expect(scroll.scrollTop).toBe(0);
  });
  it("opens a low-weight action popover before requesting cancellation, retaining its stable focus target", () => {
    const onCancel = vi.fn(), render = session(() => ScheduleRowActions({ item, disabled: false, onCancel }));
    const tree = render(), trigger = find(tree, PopoverTrigger).props.render as React.ReactElement<React.ComponentProps<typeof Button>>;
    expect(trigger.props.className).toContain("size-11"); expect(trigger.props["aria-label"]).toContain("更多待办操作"); expect(onCancel).not.toHaveBeenCalled();
    const element = { isConnected: true, disabled: false } as HTMLButtonElement; (trigger.props.ref as React.RefObject<HTMLButtonElement>).current = element;
    find(tree, Popover).props.onOpenChange?.(true, {} as never); expect(find(render(), Popover).props.open).toBe(true);
    const action = find(render(), Button); expect(action.props.children).toEqual(["取消", "待办"]); action.props.onClick?.({} as never);
    expect(onCancel).toHaveBeenCalledWith(item, element); expect(find(render(), Popover).props.open).toBe(false);
    const disabledTree = session(() => ScheduleRowActions({ item, disabled: true, onCancel }))();
    expect((find(disabledTree, PopoverTrigger).props.render as React.ReactElement<React.ComponentProps<typeof Button>>).props.disabled).toBe(true);
    expect(find(disabledTree, Button).props.disabled).toBe(true);
  });
  it("returns the confirmation to its action or the reading region after a row disappears", () => {
    const render = session(() => SchedulePage({ kind: "todo", state: { ...initialScheduleState, loaded: true, items: [item] }, controller: null, realtime }));
    const tree = render(), region = {} as HTMLDivElement, trigger = { isConnected: true, disabled: false } as HTMLButtonElement;
    (find(tree, "div", (props) => Boolean(props["data-schedule-list-scroll"])).props.ref as React.RefObject<HTMLDivElement>).current = region;
    find(tree, ScheduleRows).props.onCancel(item, trigger);
    const confirmation = find(render(), ScheduleCancelDialog); expect(confirmation.props.item).toBe(item);
    const finalFocus = confirmation.props.finalFocus as () => unknown; expect(finalFocus()).toBe(trigger);
    trigger.disabled = true; expect(finalFocus()).toBe(region);
    trigger.disabled = false; Object.defineProperty(trigger, "isConnected", { value: false }); expect(finalFocus()).toBe(region);
  });
  it.each([true, false])("keeps row busy and renders verified TODO state after a %s completion result", async (succeeded) => {
    let status = "active", release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => options.method === "PATCH" ? new Promise<Response>((resolve) => { release = resolve; }) : json([{ id: item.id, type: "todo", status, content: item.content, trigger_at: item.triggerAt, created_at: 1 }])));
    const controller = createScheduleController("todo"); await controller.refresh();
    const render = session(() => SchedulePage({ kind: "todo", state: controller.getState(), controller, realtime }));
    find(render(), ScheduleRows).props.onToggle(item); expect(controller.getState().pending).toBe(item.id);
    const busy = find(render(), ScheduleRows), html = renderToStaticMarkup(<TooltipProvider><ScheduleRows {...busy.props} /></TooltipProvider>);
    expect(html).toContain('data-loading="true"'); expect(html).toContain('aria-pressed="false"');
    if (succeeded) status = "done"; release(json(succeeded ? { ok: true } : { detail: "rejected" }, succeeded ? 200 : 422)); await flush();
    expect(controller.getState().pending).toBeNull(); expect(controller.getState().items[0].status).toBe(succeeded ? "done" : "active");
    if (succeeded) {
      find(render(), SegmentedControlItem, (props) => props.selected === false).props.onClick?.({} as never);
      const rows = find(render(), ScheduleRows); rows.props.onToggle(rows.props.items[0]);
      expect(controller.getState().pending).toBe(item.id); status = "active"; release(json({ ok: true })); await flush();
      expect(controller.getState().items[0].status).toBe("active");
    } else expect(renderToStaticMarkup(<>{render()}</>)).toContain("内容或时间未通过后端校验");
    controller.dispose();
  });
});
