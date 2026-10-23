import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatExecutionFeedback } from "./ChatExecutionFeedback";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { find, hookSession } from "./test-utils/hook-session";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());
const base = { summary: "回复结果待确认", detail: "安全的错误说明", uncertain: true, reviewReady: false };
describe("layered Chat recovery feedback", () => {
  it("starts with one compact accessible entry and keeps technical explanation and actions collapsed", () => {
    const html = renderToStaticMarkup(<ChatExecutionFeedback {...base} onRefresh={vi.fn()} />);
    expect(html).toContain('aria-expanded="false"'); expect(html).toContain("查看详情");
    expect(html).not.toContain(base.detail); expect(html).not.toContain("后台任务"); expect(html).not.toContain("刷新状态");
  });
  it("expands and closes with the existing Popover and keeps its scrollable content above the Composer", () => {
    const s = hookSession(() => ChatExecutionFeedback(base));
    find(s.render(), Popover).props.onOpenChange?.(true, {} as never);
    expect(find(s.render(), Popover).props.open).toBe(true);
    expect(find(s.render(), PopoverContent).props.side).toBe("top");
    expect(find(s.render(), PopoverContent).props.collisionAvoidance?.side).toBe("none");
    find(s.render(), Popover).props.onOpenChange?.(false, {} as never);
    expect(find(s.render(), Popover).props.open).toBe(false);
  });
  it("only invokes explicit refresh, locks duplicate clicks, and does not allow release before a successful history read", async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((done) => { finish = done; })), release = vi.fn();
    let reviewReady = false;
    const s = hookSession(() => ChatExecutionFeedback({ ...base, reviewReady, onRefresh: refresh, onReturnToEdit: release }));
    const button = () => find(s.render(), Button, (p) => React.Children.toArray(p.children).includes("刷新状态"));
    const first = button().props.onClick?.({} as never); button().props.onClick?.({} as never);
    expect(refresh).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled();
    expect(() => find(s.render(), Button, (p) => p.children === "已核对历史，返回编辑")).toThrow();
    finish(); await first; reviewReady = true;
    const back = find(s.render(), Button, (p) => p.children === "已核对历史，返回编辑");
    expect(JSON.stringify(find(s.render(), PopoverContent).props.children)).toContain("返回编辑不会停止后台任务");
    back.props.onClick?.({} as never); expect(release).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledOnce();
    expect(find(s.render(), Popover).props.open).toBe(false);
  });
  it("retains ordinary request failure detail and reports refresh errors safely", async () => {
    const refresh = vi.fn(async () => { throw new Error("private endpoint"); });
    const s = hookSession(() => ChatExecutionFeedback({ ...base, uncertain: false, onRefresh: refresh }));
    const button = find(s.render(), Button, (p) => React.Children.toArray(p.children).includes("刷新状态"));
    await button.props.onClick?.({} as never);
    const tree = JSON.stringify(find(s.render(), PopoverContent).props.children);
    expect(tree).toContain(base.detail); expect(tree).toContain("暂时无法刷新"); expect(tree).not.toContain("private endpoint");
  });
});
