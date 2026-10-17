import { readFileSync } from "node:fs";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityController } from "@/application/activity/activity-controller";
import { INITIAL_ACTIVITY_STATE } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent } from "@/components/ui/alert-dialog";
import { ActivityDialogHeader } from "./ActivityDialogHeader";
import { ActivityClearDialog, ActivitySummaryContent, ActivitySummaryDialog } from "./ActivityDialogs";

const css = readFileSync(new URL("./activity.css", import.meta.url), "utf8");
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}
function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("Activity Dialog composition", () => {
  it("uses shared header/title/description/close semantics with the established eyebrow", () => {
    const header = ActivityDialogHeader({ title: "添加网络标记", description: "说明", busy: true });
    expect(find(header, DialogHeader)).toBeDefined();
    expect(find(header, DialogTitle).props.children).toBe("添加网络标记");
    expect(find(header, DialogDescription).props.children).toBe("说明");
    expect(elements(header).find((element) => element.type === "p")?.props).toMatchObject({ children: "ACTIVITY LOG", className: expect.stringContaining("font-decorative") });
    expect(find(header, DialogClose).props).toMatchObject({ disabled: true, "aria-label": "关闭添加网络标记", title: "关闭添加网络标记" });
  });
  it("keeps the summary header outside the only scroll body and does not add a footer", () => {
    const tree = ActivitySummaryDialog({ open: true, state: INITIAL_ACTIVITY_STATE, controller: null, onClose: vi.fn() });
    const popup = find(tree, DialogContent);
    expect(popup.props).toMatchObject({ className: "activity-dialog", showCloseButton: false });
    expect(React.Children.toArray(popup.props.children).map((child) => (child as React.ReactElement).type)).toEqual([ActivityDialogHeader, ActivitySummaryContent]);
    expect(elements(tree).some((element) => element.type === DialogFooter)).toBe(false);
    expect(block(".activity-dialog[data-slot]")).toContain("100dvh");
    expect(block(".activity-dialog[data-slot]")).toContain("overflow: hidden");
    expect(block('.activity-dialog > [data-slot="alert-dialog-header"]')).toContain("flex-shrink: 0");
    for (const rule of ["min-height: 0", "flex: 1 1 auto", "overflow-y: auto", "overscroll-behavior: contain"]) expect(block(".activity-dialog-body")).toContain(rule);
    const body = ActivitySummaryContent({ state: INITIAL_ACTIVITY_STATE, onRetry: vi.fn() });
    expect(body.props.className).toBe("activity-dialog-body");
  });
  it("retries summary reads and closes through the existing callbacks", () => {
    const onClose = vi.fn(), loadSummary = vi.fn(async () => {});
    const controller = { loadSummary } as unknown as ActivityController;
    const state = { ...INITIAL_ACTIVITY_STATE, summary: { data: null, loading: false, error: "读取失败" } };
    const tree = ActivitySummaryDialog({ open: true, state, controller, onClose });
    find(tree, Dialog).props.onOpenChange?.(false, {} as never); expect(onClose).toHaveBeenCalledOnce();
    const body = ActivitySummaryContent(find(tree, ActivitySummaryContent).props);
    find(body, Button).props.onClick?.({} as never);
    expect(loadSummary).toHaveBeenCalledWith(true);
  });
  it("mutes and italicizes missing-data notices while preserving observed or carried activity text", () => {
    const summaries = [
      { start: "22:20", end: "22:50", summary: "缺少活动数据（无新上报或先前状态已过期，不代表没有活动）", count: 0 },
      { start: "22:00", end: "22:10", summary: "手机: QQ（3次观测；估算使用约2分钟）, 约8分钟缺少活动数据", count: 3 },
      { start: "22:10", end: "22:20", summary: "手机: QQ（本窗口无新上报，沿用此前观测；估算使用约2分钟）", count: 0 },
    ];
    const body = ActivitySummaryContent({ state: { ...INITIAL_ACTIVITY_STATE, summary: { data: summaries, loading: false, error: null } }, onRetry: vi.fn() });
    const paragraphs = elements(body).filter((element) => element.type === "p" && summaries.some((row) => row.summary === element.props.children));
    expect(paragraphs.map((element) => element.props.children)).toEqual(summaries.map((row) => row.summary));
    expect(paragraphs[0].props.className).toContain("text-muted-foreground italic");
    for (const paragraph of paragraphs.slice(1)) expect(paragraph.props.className).not.toContain("italic");
    expect(elements(body).filter((element) => element.type === "span" && element.props.className === "text-primary-ink")).toHaveLength(3);
  });
  it("preserves AlertDialog semantics and busy guards for clearing all logs", () => {
    const onClose = vi.fn(), onConfirm = vi.fn();
    const busy = ActivityClearDialog({ open: true, busy: true, onClose, onConfirm });
    expect(find(busy, AlertDialogContent).props.className).toBe("activity-dialog");
    find(busy, AlertDialog).props.onOpenChange?.(false, {} as never); expect(onClose).not.toHaveBeenCalled();
    expect(find(busy, AlertDialogCancel).props).toMatchObject({ variant: "ghost", disabled: true });
    expect(find(busy, AlertDialogAction).props).toMatchObject({ variant: "destructive", disabled: true });
    const idle = ActivityClearDialog({ open: true, busy: false, onClose, onConfirm });
    find(idle, AlertDialogAction).props.onClick?.({} as never); expect(onConfirm).toHaveBeenCalledOnce();
  });
  it("uses a right-aligned mobile footer and inherits Mist instead of defining another material", () => {
    const footer = block('.activity-dialog > [data-slot="alert-dialog-footer"]');
    for (const rule of ["flex-flow: row wrap", "justify-content: flex-end", "flex-shrink: 0", "margin: 0", "background: transparent"]) expect(footer).toContain(rule);
    expect(block('.activity-dialog > [data-slot$="footer"] > button')).toContain("min-height: 2.75rem");
    expect(block(".activity-dialog[data-slot]")).not.toMatch(/background|box-shadow|backdrop-filter/);
  });
});
