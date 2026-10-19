import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialScheduleState, type ScheduleController, type ScheduleState } from "@/application/schedule/schedule-controller";
import type { ManagedScheduleKind } from "@/domain/schedule";
import { Button } from "@/components/ui/button";
import { LocationTimeField } from "@/components/location/LocationTimeField";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ScheduleCreateDialog } from "./ScheduleCreateDialog";
import { ScheduleDateField } from "./ScheduleDateField";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useEffect: vi.fn(actual.useEffect) };
});
afterEach(() => vi.restoreAllMocks());
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T, predicate = (_props: Record<string, unknown>) => true) {
  const element = elements(node).find((child) => child.type === type && predicate(child.props));
  if (!element) throw new Error(`Missing ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}
function setup(kind: ManagedScheduleKind) {
  let state: ScheduleState = { ...initialScheduleState, zone: "America/New_York" }, cursor = 0;
  const values: unknown[] = [], effects: React.EffectCallback[] = [];
  const create = vi.fn(async () => true), loadZone = vi.fn(async () => {}), changeScope = vi.fn(), onClose = vi.fn();
  const controller = { create, loadZone, changeScope } as unknown as ScheduleController;
  const useState = ((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  }) as typeof React.useState;
  const render = () => {
    cursor = 0;
    const stateSpy = vi.spyOn(React, "useState").mockImplementation(useState);
    const effectSpy = vi.spyOn(React, "useEffect").mockImplementation((fn) => { effects.push(fn); });
    try { return ScheduleCreateDialog({ open: true, kind, state, controller, onClose }); } finally { stateSpy.mockRestore(); effectSpy.mockRestore(); }
  };
  const fill = (value: string) => find(render(), Textarea).props.onChange?.({ target: { value } } as never);
  const time = (part: "date" | "time", value: string) => {
    if (part === "date") find(render(), ScheduleDateField).props.onChange(value);
    else find(render(), LocationTimeField).props.onChange(value);
  };
  const submit = async () => { (find(render(), "form").props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const body = () => renderToStaticMarkup(<>{find(render(), DialogBody).props.children}</>);
  const createButton = () => find(render(), Button, (props) => props.type === "submit");
  return { render, fill, time, submit, body, createButton, create, loadZone, onClose, effects, update: (patch: Partial<ScheduleState>) => { state = { ...state, ...patch }; } };
}

describe("compact schedule create forms", () => {
  it("creates a reminder with optional date-only information and no automatic trigger", async () => {
    const s = setup("reminder"); s.fill("想持续关注"); s.time("date", "2026-10-19"); await s.submit();
    expect(s.create).toHaveBeenCalledWith("想持续关注", "2026-10-19"); expect(s.onClose).toHaveBeenCalledOnce();
    expect(s.body()).toContain("记挂不会按时间触发或自动完成");
  });
  it("creates a reminder with no date rather than inventing today", async () => {
    const s = setup("reminder"); s.fill("想法"); await s.submit(); expect(s.create).toHaveBeenCalledWith("想法", undefined);
  });
  it("provides quick TODO content, preserves [?] and has no deadline field", async () => {
    const s = setup("todo"); s.fill("待确认 [?]"); expect(elements(s.render()).filter((element) => element.type === ScheduleDateField || element.type === LocationTimeField)).toHaveLength(0);
    await s.submit(); expect(s.create).toHaveBeenCalledWith("待确认 [?]", undefined); expect(s.body()).toContain("不会自动提醒");
  });
  it("uses the server timezone label and sends entered minute text without browser/UTC conversion", async () => {
    const s = setup("alarm"); s.render(); s.effects[0](); expect(s.loadZone).toHaveBeenCalledOnce();
    s.fill("休息"); s.time("date", "2026-10-19"); s.time("time", "22:00");
    const body = s.body(); expect(body).toContain("服务器时间 · America/New_York");
    expect(body).not.toMatch(/离线|一次性闹钟|重新确认时区|bg-primary\/5/);
    expect(body).not.toMatch(/type="date"|type="time"|<label[^>]*for="alarm-(date|time)"/);
    expect(body).toContain('aria-label="提醒日期，2026-10-19"'); expect(body).toContain('aria-label="提醒时间，22:00"');
    expect(body).toContain('aria-describedby="alarm-time-zone"'); await s.submit();
    expect(s.create).toHaveBeenCalledWith("休息", "2026-10-19 22:00"); expect(s.onClose).toHaveBeenCalledOnce();
  });
  it("blocks alarm creation when the timezone is missing or being rechecked", async () => {
    const s = setup("alarm"); s.fill("休息"); s.time("date", "2026-10-19"); s.time("time", "22:00");
    s.update({ zone: null, zoneError: "无法确认服务器时区" }); expect(s.createButton().props.disabled).toBe(true); await s.submit(); expect(s.create).not.toHaveBeenCalled();
    expect(s.body()).toContain("确认服务器时区后才能创建闹钟");
    s.update({ zone: "Europe/Paris", zoneLoading: true }); await s.submit(); expect(s.create).not.toHaveBeenCalled();
  });
  it("offers timezone recovery only beside failed fields and keeps the draft through recovery", async () => {
    const s = setup("alarm"); s.fill("保留内容"); s.time("date", "2026-10-19"); s.time("time", "22:00");
    s.update({ zone: null, zoneError: "无法确认服务器时区，暂不能创建闹钟。" });
    expect(s.body()).toContain("暂不能创建闹钟"); expect(s.createButton().props.disabled).toBe(true);
    const retry = find(s.render(), Button, (props) => props.children === "重新确认时区"); retry.props.onClick?.({} as never); expect(s.loadZone).toHaveBeenCalledOnce();
    s.update({ zoneLoading: true, zoneError: null }); expect(s.body()).toContain("正在确认服务器时区…"); expect(s.body()).not.toContain("重新确认时区");
    s.update({ zoneLoading: false, zone: "Europe/Paris" }); expect(s.body()).not.toContain("重新确认时区"); expect(s.createButton().props.disabled).toBe(false);
    await s.submit(); expect(s.create).toHaveBeenCalledWith("保留内容", "2026-10-19 22:00");
  });
  it("keeps an optional reminder date when the existing time selection is cleared", async () => {
    const s = setup("reminder"); s.fill("仅保留日期"); s.time("date", "2026-10-19"); s.time("time", "22:00");
    find(s.render(), Button, (props) => props.children === "清除时间").props.onClick?.({} as never);
    expect(find(s.render(), LocationTimeField).props.value).toBe(""); await s.submit();
    expect(s.create).toHaveBeenCalledWith("仅保留日期", "2026-10-19");
  });
  it("blocks the alarm calendar until the server timezone has been confirmed and disables both selectors while saving", () => {
    const s = setup("alarm"); s.update({ zone: null }); expect(find(s.render(), ScheduleDateField).props.disabled).toBe(true);
    s.update({ zone: "Europe/Paris", zoneLoading: true }); expect(find(s.render(), ScheduleDateField).props.disabled).toBe(true);
    s.update({ zoneLoading: false }); expect(find(s.render(), ScheduleDateField).props.disabled).toBe(false);
    s.update({ pending: "create" }); expect(find(s.render(), ScheduleDateField).props.disabled).toBe(true); expect(find(s.render(), LocationTimeField).props.disabled).toBe(true);
  });
  it.each([["", ""], ["2026-02-30", "22:00"], ["2026-10-19", "22:00:01"], ["2026-10-19", "24:00"]])("rejects invalid alarm date/time %s %s", async (date, time) => {
    const s = setup("alarm"); s.fill("提醒"); s.time("date", date); s.time("time", time); await s.submit();
    expect(s.create).not.toHaveBeenCalled(); expect(s.onClose).not.toHaveBeenCalled(); expect(s.body()).toContain('role="alert"');
  });
  it("retains the draft after failure and blocks a second submit when a POST result is unknown", async () => {
    const s = setup("todo"); s.create.mockResolvedValue(false); s.fill("不要重复创建"); await s.submit();
    s.update({ issue: { text: "创建结果未知" } }); await s.submit();
    expect(s.create).toHaveBeenCalledOnce(); expect(s.onClose).not.toHaveBeenCalled(); expect(find(s.render(), Textarea).props.value).toBe("不要重复创建");
    expect(s.body()).toContain("创建结果未知"); expect(s.createButton().props.disabled).toBe(true);
  });
  it("protects in-flight requests and asks before discarding a dirty form", () => {
    const s = setup("todo"); s.fill("未提交内容"); const cancel = vi.fn();
    find(s.render(), Dialog).props.onOpenChange?.(false, { cancel } as never);
    expect(cancel).toHaveBeenCalledOnce(); expect(find(s.render(), AlertDialog).props.open).toBe(true); expect(s.onClose).not.toHaveBeenCalled();
    find(s.render(), AlertDialogAction).props.onClick?.({} as never); expect(s.onClose).toHaveBeenCalledOnce();
    s.update({ pending: "create" }); expect(find(s.render(), Dialog).props.disablePointerDismissal).toBe(true);
    find(s.render(), Dialog).props.onOpenChange?.(false, { cancel } as never); expect(cancel).toHaveBeenCalledTimes(2); expect(s.createButton().props.disabled).toBe(true);
  });
});
