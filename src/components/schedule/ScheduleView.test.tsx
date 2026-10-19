import { readFileSync } from "node:fs";
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
import { ScheduleReminder } from "./ScheduleRuntime";
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
    expect(html).toContain('data-schedule-list-scroll="true"'); expect(html).toContain('aria-label="记挂页面内容"');
  });
  it("shows TODO's raw uncertainty marker and record time without offering deadline or edit semantics", () => {
    const html = page("todo", [row("todo"), row("todo", "done", "done")]);
    expect(html).toContain("事项 sch_1 [?]"); expect(html).toContain("记录时间："); expect(html).toContain("未完成 1"); expect(html).toContain("已完成 1");
    expect(html).not.toContain("事项 done"); expect(html).not.toMatch(/截止|编辑待办|定时提醒|重复规则/);
  });
  it("distinguishes waiting from triggered and never promises a successful model or camera execution", () => {
    const html = page("alarm", [row("alarm"), row("alarm", "triggered", "triggered"), row("monitor", "active", "camera")]);
    expect(html).toContain("等待触发"); expect(html).toContain("已触发"); expect(html).toContain('aria-label="更多闹钟操作：事项 sch_1 [?]"');
    expect(html).not.toContain('aria-label="更多闹钟操作：事项 triggered'); expect(html).not.toContain("事项 camera");
    expect(html).not.toMatch(/执行成功|恢复闹钟|贪睡|每天重复|启用开关/);
  });
  it("shows only active monitors in the check view and leaves triggered/cancelled history read-only", () => {
    const items = [row("monitor", "active", "check"), row("monitor", "triggered", "past-check"), row("monitor", "cancelled", "cancelled-check"), row("alarm", "active", "alarm")];
    expect(selectSchedules(items, "monitor", "active").map((item) => item.id)).toEqual(["check"]);
    const html = page("monitor", items);
    expect(html).toContain("事项 check [?]"); expect(html).toContain("更多查岗操作"); expect(html).toContain("尝试查看一次摄像头");
    expect(html).not.toContain("事项 alarm"); expect(html).not.toContain("事项 past-check"); expect(html).not.toContain("事项 cancelled-check");
    expect(html).not.toMatch(/执行成功|恢复查岗|重试查岗|重复执行|静默时段|<details/);
    const triggered = renderToStaticMarkup(<TooltipProvider><ScheduleRows items={[row("monitor", "triggered")]} kind="monitor" busy={null} blocked={false} onCancel={vi.fn()} onToggle={vi.fn()} /></TooltipProvider>);
    expect(triggered).toContain('aria-label="已触发查岗"'); expect(triggered).not.toContain("更多查岗操作");
    expect(triggered).toContain("grid-cols-subgrid items-start"); expect(triggered).toContain("tabular-nums");
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
  it.each(["reminder", "todo", "alarm", "monitor"] as const)("pins the count at the paper's upper right without a list title bar for %s", (kind) => {
    const html = page(kind);
    const paper = html.match(/<section[^>]*data-schedule-reading-panel="true"[^>]*>/)?.[0];
    const scroll = html.match(/<div[^>]*data-schedule-list-scroll="true"[^>]*>/)?.[0];
    expect(paper).toContain("memory-reading-panel mist-glass-strong"); expect(paper).toContain("flex min-h-0 flex-1 flex-col overflow-hidden"); expect(paper).not.toContain("mist-solid");
    expect(paper).toContain("relative"); expect(html).not.toContain("data-schedule-list-header"); expect(html).not.toContain("<h2");
    const count = html.match(/<span[^>]*data-schedule-total="true"[^>]*>/)?.[0];
    expect(count).toContain("memory-total-decoration font-decorative"); expect(count).toContain("absolute right-3 top-2.5 z-10 text-xl sm:right-5");
    expect(html.indexOf('data-schedule-total="true"')).toBeLessThan(html.indexOf('data-schedule-list-scroll="true"'));
    expect(scroll).toContain("min-h-0 flex-1"); expect(scroll).toContain("scrollbar-none"); expect(scroll).toContain("overscroll-contain"); expect(scroll).toContain("safe-area-inset-bottom");
    expect(html.match(/overflow-y-auto/g)).toHaveLength(1); expect(html).not.toContain("data-page-scroll-area"); expect(html).not.toContain("回到");
    expect(html.indexOf('data-slot="page-header"')).toBeLessThan(html.indexOf('data-schedule-list-scroll="true"'));
    if (kind !== "reminder") {
      const filter = html.match(/<div[^>]*data-schedule-filters="true"[^>]*>/)?.[0]; expect(filter).toContain("shrink-0");
      expect(html.indexOf('data-schedule-filters="true"')).toBeLessThan(html.indexOf('data-schedule-reading-panel="true"'));
      expect(html.match(/data-selection="segment"/g)).toHaveLength(2); expect(html).not.toContain('data-selection="filter"');
    }
    if (kind === "alarm") expect(html).not.toContain("创建时会重新确认时区");
  });
  it("keeps long reminder, TODO and alarm content complete in the same scroll region", () => {
    const content = "较长的正文\n".repeat(20) + "https://example.test/" + "longword".repeat(50);
    for (const [kind, count] of [["reminder", 60], ["todo", 40], ["alarm", 400], ["monitor", 400]] as const) {
      const items = Array.from({ length: count }, (_, index) => ({ ...row(kind, "active", `item_${index}`), content: `${index} ${content}` }));
      const html = page(kind, items);
      expect(html.match(/data-schedule-row=/g)).toHaveLength(count); expect(html.match(/data-schedule-list-scroll=/g)).toHaveLength(1); expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
      expect(html).toContain(`${count - 1} ${content}`); expect(html).not.toMatch(/line-clamp|text-ellipsis/);
      const body = html.match(/<p[^>]*data-schedule-body="true"[^>]*>/)?.[0];
      expect(body).toContain("text-[13px] font-normal"); expect(body).toContain((kind === "alarm" || kind === "monitor") ? "leading-5" : "leading-7"); expect(html).toContain("[overflow-wrap:anywhere]");
    }
  });
  it("uses Memory's actual body typography, foreground and decorative count rules without copying its clamp", () => {
    const memoryItem = readFileSync(new URL("../memory/MemoryItem.tsx", import.meta.url), "utf8");
    const memoryView = readFileSync(new URL("../memory/MemoryView.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    const html = page("reminder", [row("reminder")]);
    for (const token of ["text-[13px]", "leading-7", "sm:text-sm", "text-[color-mix(in_srgb,var(--color-foreground)_70%,var(--color-muted-strong))]"]) {
      expect(memoryItem).toContain(token); expect(html).toContain(token);
    }
    expect(memoryView).toContain("memory-total-decoration font-decorative");
    expect(styles).toMatch(/\.memory-total-decoration\s*\{[^}]*var\(--color-theme\) 36%, transparent[^}]*font-variant-numeric: normal/);
    expect(html).not.toContain("line-clamp"); expect(html).toContain("text-xs leading-5 text-muted-foreground");
  });
  it("puts alarm time beside the full-width body and displays the calendar date without repeating the minute", () => {
    const html = renderToStaticMarkup(<TooltipProvider><ScheduleRows items={[{ ...row("alarm", "triggered"), triggerAt: "2026-10-19 22:37" }]} kind="alarm" busy={null} blocked={false} onToggle={vi.fn()} onCancel={vi.fn()} /></TooltipProvider>);
    expect(html).toContain("grid-cols-[auto_minmax(0,1fr)]"); expect(html.match(/22:37/g)).toHaveLength(1); expect(html.match(/2026-10-19/g)).toHaveLength(1);
    const body = html.match(/<p[^>]*data-schedule-body="true"[^>]*>/)?.[0]; expect(body).toContain("leading-5"); expect(body).not.toContain("leading-7");
    expect(html).toContain('aria-label="已触发闹钟"'); expect(html).not.toContain("更多闹钟操作"); expect(html).not.toContain("max-w-");
  });
  it("shares the alarm time track across different numerals and top-aligns equal-height first line boxes", () => {
    const items = ["09:00", "18:57", "12:00"].map((time, index) => ({ ...row("alarm", "triggered", `time_${index}`), triggerAt: `2026-10-19 ${time}` }));
    const html = renderToStaticMarkup(<TooltipProvider><ScheduleRows items={items} kind="alarm" busy={null} blocked={false} onToggle={vi.fn()} onCancel={vi.fn()} /></TooltipProvider>);
    expect(html.match(/<ul[^>]*>/)?.[0]).toContain("grid-cols-[auto_minmax(0,1fr)]");
    const rows = [...html.matchAll(/<li[^>]*data-schedule-row="[^"]+"[^>]*>/g)]; expect(rows).toHaveLength(3);
    for (const [row] of rows) { expect(row).toContain("col-span-2"); expect(row).toContain("grid-cols-subgrid items-start"); expect(row).not.toContain("items-baseline"); }
    const times = [...html.matchAll(/<p[^>]*data-schedule-alarm-time="true"[^>]*>/g)];
    for (const [time] of times) { expect(time).toContain("tabular-nums"); expect(time).toContain("leading-5"); expect(time).not.toContain("leading-7"); }
  });
  it.each(["active", "triggered"] as const)("sorts %s alarms by newest server-local trigger minute, independently of creation order", (status) => {
    const alarms = [
      { ...row("alarm", status, "older"), triggerAt: "2025-12-31 23:59", createdAt: 999 },
      { ...row("alarm", status, "newer"), triggerAt: "2026-10-19T23:00", createdAt: 1 },
      { ...row("alarm", status, "middle"), triggerAt: "2026-10-19 22:00", createdAt: 50 },
      { ...row("alarm", status, "invalid"), triggerAt: "invalid", createdAt: 1000 },
    ];
    expect(selectSchedules(alarms, "alarm", status).map((item) => item.id)).toEqual(["newer", "middle", "older", "invalid"]);
    expect(alarms[0].id).toBe("older");
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
    const dismiss = vi.fn(), notice = ScheduleReminder({ notice: { type: "schedule-alarm", id: "a", content: "在线提醒", triggerAt: "2001-01-01 09:00" }, count: 2, dismiss });
    expect(find(notice, Dialog).props.open).toBe(true);
    expect(renderToStaticMarkup(<>{find(notice, DialogDescription).props.children}{find(notice, DialogBody).props.children}</>)).toContain("关闭此提醒仅关闭本地提示");
    find(notice, Button).props.onClick?.({} as never); expect(dismiss).toHaveBeenCalledOnce();
    expect(find(ScheduleReminder({ count: 0, dismiss }), Dialog).props.open).toBe(false);
  });
  it("uses a neutral camera-start notice for the shared monitor event without implying screenshot or response success", () => {
    const dismiss = vi.fn(), notice = ScheduleReminder({ notice: { type: "monitor-alert", content: "<img src=private.jpg>查看一下" }, count: 1, dismiss });
    expect(find(notice, Dialog).props.open).toBe(true);
    const html = renderToStaticMarkup(<>{find(notice, DialogDescription).props.children}{find(notice, DialogBody).props.children}</>);
    expect(html).toContain("尚未确认截图或回复结果"); expect(html).toContain("&lt;img"); expect(html).not.toContain("<img");
    expect(html).not.toMatch(/执行成功|截图成功|定时查岗已完成|服务器本地时间/);
    find(notice, Button).props.onClick?.({} as never); expect(dismiss).toHaveBeenCalledOnce();
  });
  it("describes monitor cancellation as a soft mark and retains the claim boundary", () => {
    const tree = ScheduleCancelDialog({ item: row("monitor"), state: initialScheduleState, controller: null, onClose: vi.fn() });
    const description = renderToStaticMarkup(<>{find(tree, AlertDialogDescription).props.children}</>);
    expect(description).toContain("记录会标记为已取消，保留在后端"); expect(description).toContain("不保证撤回正在进行的截图或回复");
  });
});
