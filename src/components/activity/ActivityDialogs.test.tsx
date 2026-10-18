import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityController } from "@/application/activity/activity-controller";
import { INITIAL_ACTIVITY_STATE } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogCloseButton, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent } from "@/components/ui/alert-dialog";
import { ActivityDialogHeader } from "./ActivityDialogHeader";
import { ActivityClearDialog, ActivitySummaryContent, ActivitySummaryDialog } from "./ActivityDialogs";

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}

describe("Activity Dialog composition", () => {
  it("uses shared header/title/description/close semantics with the established eyebrow", () => {
    const header = ActivityDialogHeader({ title: "添加网络标记", description: "说明", busy: true });
    expect(find(header, DialogHeader)).toBeDefined();
    expect(find(header, DialogTitle).props.children).toBe("添加网络标记");
    expect(find(header, DialogDescription).props.children).toBe("说明");
    expect(elements(header).find((element) => element.type === "p")?.props).toMatchObject({ children: "ACTIVITY LOG", className: expect.stringContaining("font-decorative") });
    expect(find(header, DialogCloseButton).props).toMatchObject({ disabled: true, "aria-label": "关闭添加网络标记" });
  });
  it("keeps the summary header outside the only scroll body and does not add a footer", () => {
    const tree = ActivitySummaryDialog({ open: true, state: INITIAL_ACTIVITY_STATE, controller: null, onClose: vi.fn() });
    const popup = find(tree, DialogContent);
    expect(popup.props).toMatchObject({ className: "max-w-xl", showCloseButton: false });
    expect(React.Children.toArray(popup.props.children).map((child) => (child as React.ReactElement).type)).toEqual([ActivityDialogHeader, ActivitySummaryContent]);
    expect(elements(tree).some((element) => element.type === DialogFooter)).toBe(false);
    const body = ActivitySummaryContent({ state: INITIAL_ACTIVITY_STATE, onRetry: vi.fn() });
    expect(body.type).toBe(DialogBody);
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
    expect(find(busy, AlertDialogContent).props.className).toBeUndefined();
    const cancel = vi.fn();
    find(busy, AlertDialog).props.onOpenChange?.(false, { cancel } as never); expect(onClose).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce();
    expect(find(busy, AlertDialogCancel).props).toMatchObject({ variant: "ghost", disabled: true });
    expect(find(busy, AlertDialogAction).props).toMatchObject({ variant: "destructive", disabled: true });
    const idle = ActivityClearDialog({ open: true, busy: false, onClose, onConfirm });
    find(idle, AlertDialogAction).props.onClick?.({} as never); expect(onConfirm).toHaveBeenCalledOnce();
  });
  it("returns menu-launched dialogs to the stable page action through Base UI", () => {
    const finalFocus = React.createRef<HTMLButtonElement>();
    expect(find(ActivitySummaryDialog({ open: true, state: INITIAL_ACTIVITY_STATE, controller: null, onClose: vi.fn(), finalFocus }), DialogContent).props.finalFocus).toBe(finalFocus);
    expect(find(ActivityClearDialog({ open: true, busy: false, onClose: vi.fn(), onConfirm: vi.fn(), finalFocus }), AlertDialogContent).props.finalFocus).toBe(finalFocus);
  });
});
