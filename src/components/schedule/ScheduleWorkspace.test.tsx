import * as React from "react";
import { Menu } from "@base-ui/react/menu";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduleController, initialScheduleState, type ScheduleController } from "@/application/schedule/schedule-controller";
import type { Schedule } from "@/domain/schedule";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControlItem } from "@/components/ui/selection-control";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClockScheduleView, ScheduleKindMenu, SchedulePage } from "./ScheduleView";
import { ScheduleRows, ScheduleRowActions } from "./ScheduleRows";
import { ScheduleCancelDialog } from "./ScheduleCancelDialog";
import { ScheduleCreateDialog } from "./ScheduleCreateDialog";
import { scheduleMeta } from "./schedule-presentation";

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
const titleMenu = (tree: React.ReactNode) => find(tree, PageHeader).props.title as React.ReactElement<React.ComponentProps<typeof ScheduleKindMenu>>;

describe("clock title menu", () => {
  it.each(["alarm", "monitor"] as const)("opens and dismisses the %s menu while retaining its current selection", (kind) => {
    const onChange = vi.fn(), triggerRef = React.createRef<HTMLButtonElement>();
    const render = session(() => ScheduleKindMenu({ kind, disabled: false, triggerRef, onChange }));
    expect(find(render(), Menu.Root).props.open).toBe(false);
    find(render(), Menu.Root).props.onOpenChange?.(true, {} as never);
    const opened = render(); expect(find(opened, Menu.Root).props.open).toBe(true);
    expect(find(opened, Menu.RadioGroup).props.value).toBe(kind);
    const options = elements(opened).filter((node) => node.type === Menu.RadioItem);
    expect(options.map((node) => node.props.value)).toEqual(["alarm", "monitor"]);
    for (const option of options) {
      expect(option.props.closeOnClick).toBe(true); expect(option.props.className).toContain("data-checked:text-primary-ink");
      expect(elements(option).some((node) => node.type === Menu.RadioItemIndicator)).toBe(true);
    }
    const trigger = find(opened, Menu.Trigger).props.render as React.ReactElement<React.ComponentProps<typeof Button>>;
    expect(trigger.props.ref).toBe(triggerRef); expect(trigger.props["aria-label"]).toBe(`${scheduleMeta[kind].title}，切换任务类型`);
    expect(trigger.props.className).toContain("align-top text-xl font-semibold leading-7");
    expect(find(opened, Menu.Positioner).props).toMatchObject({ align: "start", collisionPadding: 16 });
    expect(find(opened, Menu.Popup).props.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(find(opened, Menu.Popup).props.className).toContain("max-h-(--available-height)");
    find(opened, Menu.Root).props.onOpenChange?.(false, { reason: "escape-key" } as never);
    expect(find(render(), Menu.Root).props.open).toBe(false); expect(onChange).not.toHaveBeenCalled();
    expect((find(render(), Menu.Popup).props.finalFocus as () => boolean)()).toBe(true);
  });
  it.each(["alarm", "monitor"] as const)("closes on a %s selection, switching once and leaving focus to the new page", (kind) => {
    const onChange = vi.fn(), next = kind === "alarm" ? "monitor" : "alarm";
    const render = session(() => ScheduleKindMenu({ kind, disabled: false, triggerRef: React.createRef<HTMLButtonElement>(), onChange }));
    find(render(), Menu.Root).props.onOpenChange?.(true, {} as never);
    find(render(), Menu.RadioGroup).props.onValueChange?.(kind, {} as never);
    expect(find(render(), Menu.Root).props.open).toBe(false); expect(onChange).not.toHaveBeenCalled();
    find(render(), Menu.Root).props.onOpenChange?.(true, {} as never);
    find(render(), Menu.RadioGroup).props.onValueChange?.(next, {} as never);
    expect(find(render(), Menu.Root).props.open).toBe(false); expect(onChange).toHaveBeenCalledExactlyOnceWith(next);
    expect((find(render(), Menu.Popup).props.finalFocus as () => boolean)()).toBe(false);
  });
  it("rejects unsupported or disabled changes instead of discarding an in-flight or unknown write", () => {
    const onChange = vi.fn(); let disabled = false;
    const render = session(() => ScheduleKindMenu({ kind: "alarm", disabled, triggerRef: React.createRef<HTMLButtonElement>(), onChange }));
    find(render(), Menu.RadioGroup).props.onValueChange?.("todo", {} as never); expect(onChange).not.toHaveBeenCalled();
    disabled = true; const tree = render(); expect(find(tree, Menu.Root).props).toMatchObject({ disabled: true, open: false });
    const trigger = find(tree, Menu.Trigger).props.render as React.ReactElement<React.ComponentProps<typeof Button>>; expect(trigger.props.disabled).toBe(true);
    find(tree, Menu.RadioGroup).props.onValueChange?.("monitor", {} as never); expect(onChange).not.toHaveBeenCalled();
  });
});

describe("schedule workspace interaction", () => {
  it("keeps the clock entrance flat and remounts only the selected feature with clean feedback and scroll ownership", () => {
    const onBack = vi.fn(), render = session(() => ClockScheduleView({ onBack }));
    const first = render() as React.ReactElement<{ kind: string; onClockKindChange: (kind: "alarm" | "monitor") => void; onBack: () => void; focusClockKind: boolean }>;
    expect(first.props.kind).toBe("alarm"); expect(first.key).toBe("alarm"); expect(first.props.focusClockKind).toBe(false);
    first.props.onClockKindChange("monitor"); const changed = render() as typeof first;
    expect(changed.props.kind).toBe("monitor"); expect(changed.key).toBe("monitor"); expect(changed.props.focusClockKind).toBe(true); expect(changed.props.onBack).toBe(onBack);
    changed.props.onClockKindChange("alarm"); expect((render() as typeof first).props.kind).toBe("alarm");
  });
  it("puts the type menu in the existing title and blocks switches during writes and unknown results", () => {
    const onClockKindChange = vi.fn(), changeScope = vi.fn();
    let state = { ...initialScheduleState, loaded: true };
    const render = session(() => SchedulePage({ kind: "alarm", state, controller: { changeScope } as unknown as ScheduleController, realtime, onClockKindChange }));
    const tree = render(), html = renderToStaticMarkup(<>{tree}</>);
    expect(html).toContain('data-schedule-kind-menu="true"'); expect(html).not.toContain('data-selection="filter"'); expect(html.match(/data-selection="segment"/g)).toHaveLength(2);
    expect(html).not.toContain("data-schedule-kind-filters");
    expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
    expect(titleMenu(tree).type).toBe(ScheduleKindMenu); titleMenu(tree).props.onChange("monitor");
    expect(onClockKindChange).toHaveBeenCalledWith("monitor"); expect(changeScope).toHaveBeenCalledOnce();
    state = { ...state, pending: "create" }; expect(titleMenu(render()).props.disabled).toBe(true);
    state = { ...state, pending: null, issue: { text: "创建结果未知" } }; expect(titleMenu(render()).props.disabled).toBe(true);
  });
  it("resets the reading region and focuses the new title trigger after changing type", () => {
    let kind: "alarm" | "monitor" = "alarm", focusClockKind = false;
    const render = session(() => SchedulePage({ kind, focusClockKind, state: initialScheduleState, controller: null, realtime, onClockKindChange: vi.fn() }));
    const tree = render(), scroll = { scrollTop: 700 } as HTMLDivElement, focus = vi.fn();
    (find(tree, "div", (props) => Boolean(props["data-schedule-list-scroll"])).props.ref as React.RefObject<HTMLDivElement>).current = scroll;
    titleMenu(tree).props.triggerRef.current = { focus } as unknown as HTMLButtonElement;
    render(); expect(scroll.scrollTop).toBe(700); expect(focus).not.toHaveBeenCalled();
    kind = "monitor"; focusClockKind = true; render(); expect(scroll.scrollTop).toBe(0); expect(focus).toHaveBeenCalledOnce();
    scroll.scrollTop = 100; render(); expect(scroll.scrollTop).toBe(100); expect(focus).toHaveBeenCalledOnce();
  });
  it.each(["alarm", "monitor"] as const)("keeps the %s title, create form, status views, count and scroll owner consistent", (kind) => {
    const items: Schedule[] = [
      { ...item, id: "alarm-active", kind: "alarm" },
      { ...item, id: "alarm-history", kind: "alarm", status: "triggered" },
      { ...item, id: "monitor-active-1", kind: "monitor" },
      { ...item, id: "monitor-active-2", kind: "monitor" },
      ...Array.from({ length: 3 }, (_, index): Schedule => ({ ...item, id: `monitor-history-${index}`, kind: "monitor", status: "triggered" })),
    ];
    const create = vi.fn(), act = vi.fn(), refresh = vi.fn(), changeScope = vi.fn(), onClockKindChange = vi.fn();
    const controller = { create, act, refresh, changeScope } as unknown as ScheduleController;
    const state = { ...initialScheduleState, loaded: true, items };
    const render = session(() => SchedulePage({ kind, state, controller, realtime, onClockKindChange }));
    const tree = render(), header = find(tree, PageHeader), meta = scheduleMeta[kind];
    expect(header.props).toMatchObject({ eyebrow: meta.eyebrow, description: meta.description, titleId: `${kind}-page-title` });
    expect(titleMenu(tree).props.kind).toBe(kind);
    expect(find(tree, ScheduleRows).props.items.every((row) => row.kind === kind && row.status === "active")).toBe(true);
    expect(find(tree, ScheduleCreateDialog).props.kind).toBe(kind);
    const controls = elements(header.props.actions);
    const createControl = controls.find((node) => node.props.render && (node.props.render as React.ReactElement<{ "aria-label": string }>).props["aria-label"] === meta.create)?.props.render as React.ReactElement<React.ComponentProps<typeof PageHeaderAction>>;
    expect(createControl).toBeDefined(); createControl.props.onClick?.({} as never);
    const createDialog = find(render(), ScheduleCreateDialog); expect(createDialog.props.open).toBe(true); expect(createDialog.props.kind).toBe(kind); createDialog.props.onClose();
    const scroll = { scrollTop: 450 } as HTMLDivElement;
    (find(render(), "div", (props) => Boolean(props["data-schedule-list-scroll"])).props.ref as React.RefObject<HTMLDivElement>).current = scroll;
    const count = (node: React.ReactNode) => find(node, "span", (props) => Boolean(props["data-schedule-total"]));
    expect(count(render()).props.children).toBe(kind === "alarm" ? 1 : 2);
    find(render(), SegmentedControlItem, (props) => props.selected === false).props.onClick?.({} as never);
    const history = render(); expect(scroll.scrollTop).toBe(0);
    expect(find(history, ScheduleRows).props.items.every((row) => row.kind === kind && row.status === "triggered")).toBe(true);
    expect(count(history).props.children).toBe(kind === "alarm" ? 1 : 3);
    expect(count(history).props.className).toContain("absolute right-3 top-2.5 z-10 text-xl sm:right-5");
    titleMenu(history).props.onChange(kind === "alarm" ? "monitor" : "alarm"); expect(onClockKindChange).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled(); expect(act).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  });
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
  it.each(["alarm", "monitor"] as const)("gives %s the same separate Segmented structure as TODO and switches only the visible newest-first snapshot", (kind) => {
    const alarms: Schedule[] = [
      { ...item, kind, id: "active_old", triggerAt: "2026-10-18 22:00", createdAt: 100 },
      { ...item, kind, id: "active_new", triggerAt: "2026-10-20 09:00", createdAt: 1 },
      { ...item, kind: kind === "alarm" ? "monitor" : "alarm", id: "other-feature" },
      ...Array.from({ length: 400 }, (_, index): Schedule => ({ ...item, kind, id: `history_${index}`, status: "triggered", triggerAt: `2026-10-19 ${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}` })),
    ];
    const changeScope = vi.fn(), act = vi.fn(), refresh = vi.fn();
    const controller = { changeScope, act, refresh } as unknown as ScheduleController;
    const render = session(() => SchedulePage({ kind, state: { ...initialScheduleState, loaded: true, items: alarms }, controller, realtime }));
    const tree = render(), scroll = { scrollTop: 500 } as HTMLDivElement;
    (find(tree, "div", (props) => Boolean(props["data-schedule-list-scroll"])).props.ref as React.RefObject<HTMLDivElement>).current = scroll;
    expect(find(tree, ScheduleRows).props.items.map((row) => row.id)).toEqual(["active_new", "active_old"]);
    const rootChildren = elements(tree);
    const switchIndex = rootChildren.findIndex((node) => Boolean(node.props["data-schedule-filters"]));
    const surfaceIndex = rootChildren.findIndex((node) => Boolean(node.props["data-schedule-reading-panel"]));
    expect(switchIndex).toBeLessThan(surfaceIndex);
    const surface = find(tree, "section", (props) => Boolean(props["data-schedule-reading-panel"]));
    expect(elements(surface).some((node) => node.type === SegmentedControlItem)).toBe(false);
    find(tree, SegmentedControlItem, (props) => props.selected === false).props.onClick?.({} as never);
    const changed = render(), rows = find(changed, ScheduleRows);
    expect(rows.props.items).toHaveLength(400); expect(rows.props.items[0].id).toBe("history_399"); expect(rows.props.items[rows.props.items.length - 1].id).toBe("history_0"); expect(scroll.scrollTop).toBe(0);
    expect(find(changed, SegmentedControlItem, (props) => props.selected === true).props.children).toBe("已触发");
    const historyHtml = renderToStaticMarkup(<>{changed}</>);
    expect(historyHtml).toContain('data-schedule-total="true">400</span>'); expect(historyHtml.match(/data-schedule-row=/g)).toHaveLength(400);
    expect(historyHtml.match(/overflow-y-auto/g)).toHaveLength(1); expect(historyHtml).not.toMatch(/更多闹钟操作|更多查岗操作|other-feature|执行成功/); expect(historyHtml).not.toContain("<details");
    scroll.scrollTop = 600; render(); expect(scroll.scrollTop).toBe(600);
    find(render(), SegmentedControlItem, (props) => props.selected === false).props.onClick?.({} as never);
    const waiting = render(); expect(find(waiting, SegmentedControlItem, (props) => props.selected === true).props.children).toBe("等待触发"); expect(find(waiting, ScheduleRows).props.items).toHaveLength(2); expect(scroll.scrollTop).toBe(0);
    expect(changeScope).toHaveBeenCalledTimes(2); expect(act).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  });
  it.each(["alarm", "monitor"] as const)("keeps the %s triggered empty state in its selected view with a fixed zero count", (kind) => {
    const render = session(() => SchedulePage({ kind, state: { ...initialScheduleState, loaded: true }, controller: null, realtime }));
    find(render(), SegmentedControlItem, (props) => props.selected === false).props.onClick?.({} as never);
    const html = renderToStaticMarkup(<>{render()}</>);
    expect(html).toContain(kind === "alarm" ? "还没有已触发的闹钟" : "还没有已触发的查岗"); expect(html).toContain('data-schedule-total="true">0</span>'); expect(html).not.toContain(kind === "alarm" ? "没有等待触发的闹钟" : "没有等待触发的查岗");
    expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
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
