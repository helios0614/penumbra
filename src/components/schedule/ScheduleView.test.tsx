import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialScheduleState, type ScheduleController } from "@/application/schedule/schedule-controller";
import type { ManagedScheduleKind, Schedule } from "@/domain/schedule";
import { TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { Dialog, DialogBody, DialogDescription } from "@/components/ui/dialog";
import { SchedulePage } from "./ScheduleView";
import { ScheduleRows } from "./ScheduleRows";
import { ScheduleCancelDialog } from "./ScheduleCancelDialog";
import { AlarmReminder } from "./ScheduleRuntime";
import { selectSchedules } from "./schedule-presentation";

const row = (kind: Schedule["kind"], status: Schedule["status"] = "active", id = "sch_1"): Schedule => ({ id, kind, status, content: `事项 ${id} [?]`, triggerAt: "2001-01-01 09:00", createdAt: 1 });
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as ReactNode)] : []);
}
function find<T extends React.ElementType>(node: ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing ${String(type)}`);
  return element as ReactElement<ComponentProps<T>>;
}
const realtime = { connection: "connected" as const, reconnect: vi.fn() };
const page = (kind: ManagedScheduleKind, items: Schedule[] = [], patch = {}) => renderToStaticMarkup(<SchedulePage kind={kind} state={{ ...initialScheduleState, loaded: true, items, ...patch }} controller={null} realtime={realtime} />);

describe("time pages use real schedule semantics", () => {
  it("keeps every active reminder including old dates, with content first and no invented author or expiry", () => {
    const items = [row("reminder"), row("reminder", "cancelled", "cancelled"), row("todo", "active", "todo")];
    expect(selectSchedules(items, "reminder", "active").map((item) => item.id)).toEqual(["sch_1"]);
    const html = page("reminder", items);
    expect(html).toContain("事项 sch_1 [?]"); expect(html).toContain("2001-01-01 09:00"); expect(html).toContain("已取消记挂");
    expect(html).not.toContain("事项 todo"); expect(html).not.toMatch(/已过期|AI 写的|作者|整月|每天重复|启用/);
    expect(html).toContain('data-page-scroll-area="true"'); expect(html).toContain('aria-label="记挂页面内容"');
  });
  it("shows TODO's raw uncertainty marker and record time without offering deadline or edit semantics", () => {
    const html = page("todo", [row("todo"), row("todo", "done", "done")]);
    expect(html).toContain("事项 sch_1 [?]"); expect(html).toContain("记录时间："); expect(html).toContain("未完成 1"); expect(html).toContain("已完成 1");
    expect(html).not.toContain("事项 done"); expect(html).not.toMatch(/截止|编辑待办|定时提醒|重复规则/);
  });
  it("distinguishes waiting from triggered and never promises a successful model or camera execution", () => {
    const html = page("alarm", [row("alarm"), row("alarm", "triggered", "triggered"), row("monitor", "active", "camera")]);
    expect(html).toContain("等待触发"); expect(html).toContain("已触发"); expect(html).toContain('aria-label="取消闹钟：事项 sch_1 [?]"');
    expect(html).not.toContain('aria-label="取消闹钟：事项 triggered'); expect(html).not.toContain("事项 camera");
    expect(html).not.toMatch(/执行成功|恢复闹钟|贪睡|每天重复|启用开关/);
  });
  it("renders malformed historical time as readable information without crashing", () => {
    expect(page("alarm", [{ ...row("alarm"), triggerAt: "legacy invalid text" }])).toContain("时间格式异常：legacy invalid text");
    expect(page("alarm", [{ ...row("alarm"), triggerAt: "legacy invalid text" }])).toContain("时间待核对");
  });
  it("separates loading, empty, failure and restored data", () => {
    expect(page("todo", [], { loaded: false, loading: true })).toContain("正在读取…");
    expect(page("todo")).toContain("暂时没有待办");
    const failed = page("todo", [], { loaded: false, error: "服务不可用" });
    expect(failed).toContain("尚未读取到列表"); expect(failed).not.toContain("暂时没有待办");
    const stale = page("todo", [row("todo")], { error: "离线" }); expect(stale).toContain("上次读取的数据"); expect(stale).toContain("事项 sch_1");
    expect(page("todo", [row("todo")])).not.toContain("上次读取的数据");
  });
  it("keeps an uncertain write visible instead of presenting a transient error toast", () => {
    const html = page("todo", [], { issue: { text: "创建结果未知，不会自动重发" } });
    expect(html).toContain('role="alert"'); expect(html).toContain("创建结果未知"); expect(html).toContain("重新读取核对");
  });
});

describe("real control callbacks without browser automation", () => {
  it.each(["active", "done"] as const)("offers the correct TODO toggle for %s", (status) => {
    const item = row("todo", status), onToggle = vi.fn();
    const tree = ScheduleRows({ items: [item], kind: "todo", busy: null, blocked: false, onCancel: vi.fn(), onToggle });
    const control = find(tree, TooltipTrigger).props.render as ReactElement<ComponentProps<typeof Button>>;
    expect(control.props["aria-label"]).toContain(status === "done" ? "恢复待办" : "完成待办");
    control.props.onClick?.({} as never); expect(onToggle).toHaveBeenCalledWith(item);
    const html = renderToStaticMarkup(<TooltipProvider>{tree}</TooltipProvider>); expect(html).toContain('aria-pressed="' + (status === "done") + '"');
  });
  it("waits for verified soft cancellation and keeps the dialog when the result is unknown", async () => {
    const act = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), close = vi.fn();
    const tree = ScheduleCancelDialog({ item: row("alarm"), state: initialScheduleState, controller: { act } as unknown as ScheduleController, onClose: close });
    const description = renderToStaticMarkup(<>{find(tree, AlertDialogDescription).props.children}</>);
    expect(description).toContain("标记为已取消，保留在后端"); expect(description).toContain("无法撤回"); expect(description).not.toContain("永久删除");
    const confirm = find(tree, AlertDialogAction); await confirm.props.onClick?.({} as never); expect(close).not.toHaveBeenCalled();
    await confirm.props.onClick?.({} as never); expect(act).toHaveBeenLastCalledWith("sch_1", "cancel"); expect(close).toHaveBeenCalledOnce();
    const busy = ScheduleCancelDialog({ item: row("alarm"), state: { ...initialScheduleState, pending: "sch_1" }, controller: null, onClose: close });
    const cancel = vi.fn(); find(busy, AlertDialog).props.onOpenChange?.(false, { cancel } as never); expect(cancel).toHaveBeenCalled();
  });
  it("exposes an app-wide online alarm notice whose dismissal is local and makes no mutation", () => {
    const dismiss = vi.fn(), notice = AlarmReminder({ alarm: { type: "schedule-alarm", id: "a", content: "在线提醒", triggerAt: "2001-01-01 09:00" }, count: 2, dismiss });
    expect(find(notice, Dialog).props.open).toBe(true);
    expect(renderToStaticMarkup(<>{find(notice, DialogDescription).props.children}{find(notice, DialogBody).props.children}</>)).toContain("关闭此提醒仅关闭本地提示");
    find(notice, Button).props.onClick?.({} as never); expect(dismiss).toHaveBeenCalledOnce();
    expect(find(AlarmReminder({ count: 0, dismiss }), Dialog).props.open).toBe(false);
  });
});
