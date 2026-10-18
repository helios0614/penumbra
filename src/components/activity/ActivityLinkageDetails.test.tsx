import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityController } from "@/application/activity/activity-controller";
import { INITIAL_ACTIVITY_STATE, activityReadFailure, type ActivityState } from "@/application/activity/activity-state";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PopoverContent } from "@/components/ui/popover";
import { ActivityControls } from "./ActivityControls";
import { ActivityPageFeedback } from "./ActivityFeedback";
import { ActivityLinkageDetails } from "./ActivityLinkageDetails";
import { ActivityTimeline } from "./ActivityTimeline";
import { ActivityView } from "./ActivityView";
import { PhoneStatusPanel } from "./PhoneStatusPanel";
import * as hooks from "./useActivity";

afterEach(() => vi.restoreAllMocks());
const failed = (error: ApiError) => ({ data: null, loading: false, error: "读取失败", failure: activityReadFailure(error) });
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
describe("Activity infrequent linkage diagnostics", () => {
  it.each([true, false])("keeps confirmed %s distinct and read-only in a compact, initially folded row", (enabled) => {
    const state = { ...INITIAL_ACTIVITY_STATE, legacyEnabled: { data: enabled, loading: false, error: null } };
    const html = renderToStaticMarkup(<ActivityLinkageDetails state={state} controller={null} />);
    expect(html).toContain(enabled ? "已开启" : "已关闭"); expect(html).not.toContain(enabled ? "已关闭" : "已开启");
    expect(html).toContain("与手机状态读取权限独立"); expect(html).toContain("日志和本页规则摘要仍可查看");
    expect(html).toContain("此处仅查看状态"); expect(html.match(/<details[^>]*>/)?.[0]).not.toContain("open=");
    expect(html).not.toMatch(/mist-glass|mist-solid|role="switch"|旧版|接口|配置读取/);
  });
  it("never presents a failed read with a stale false value as disabled, and retains an explicit GET recovery", () => {
    const loadLegacy = vi.fn(), setVisibility = vi.fn(), state = { ...INITIAL_ACTIVITY_STATE, legacyEnabled: { ...failed(new ApiError("独立诊断详情", 503)), data: false } };
    const tree = ActivityLinkageDetails({ state, controller: { loadLegacy, setVisibility } as unknown as ActivityController });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("暂不可用"); expect(html).toContain("暂时无法确认是否开启"); expect(html).not.toContain("已关闭");
    expect(html).toMatch(/<details[^>]*><summary[^>]*>排查信息<\/summary><p[^>]*>读取失败 HTTP_ERROR 503 独立诊断详情/);
    const retry = elements(tree).find((element) => element.type === Button)!;
    expect(retry.props.children).toBe("重新确认"); (retry.props.onClick as () => void)();
    expect(loadLegacy).toHaveBeenCalledOnce(); expect(setVisibility).not.toHaveBeenCalled();
    const recovered = renderToStaticMarkup(<ActivityLinkageDetails state={{ ...state, legacyEnabled: { data: true, loading: false, error: null } }} controller={null} />);
    expect(recovered).toContain("已开启"); expect(recovered).not.toMatch(/暂不可用|独立诊断详情|排查信息/);
  });
  it("merges a shared failure into page diagnostics without duplicating the row or recovery action", () => {
    const state = { ...INITIAL_ACTIVITY_STATE, phone: failed(new ApiError("phone", 0)), legacyEnabled: failed(new ApiError("联动诊断详情", 0)) };
    expect(ActivityLinkageDetails({ state, controller: null })).toBeNull();
    const html = renderToStaticMarkup(<ActivityPageFeedback state={state} controller={null} connection="connected" reconnect={vi.fn()} />);
    expect(html).toContain("连接异常，部分信息暂不可用");
    expect(html.match(/AI 活动参考：暂时无法确认状态/g)).toHaveLength(1); expect(html.match(/联动诊断详情/g)).toHaveLength(1);
    expect(html).not.toContain("重新确认"); expect(html).toContain(">重新读取<");
  });
  it("keeps an unrelated linkage failure discoverable even alongside a different shared failure", () => {
    const state = { ...INITIAL_ACTIVITY_STATE, phone: failed(new ApiError("offline", 0)), dates: failed(new ApiError("offline", 0)), legacyEnabled: failed(new ApiError("independent", 503)) };
    expect(renderToStaticMarkup(<ActivityLinkageDetails state={state} controller={null} />)).toContain("重新确认");
    expect(renderToStaticMarkup(<ActivityPageFeedback state={state} controller={null} connection="connected" reconnect={vi.fn()} />)).not.toContain("independent");
  });
  it("distinguishes pending and not-yet-read state, and disables repeated recovery during a read", () => {
    expect(renderToStaticMarkup(<ActivityLinkageDetails state={INITIAL_ACTIVITY_STATE} controller={null} />)).toContain("尚未确认");
    const tree = ActivityLinkageDetails({ state: { ...INITIAL_ACTIVITY_STATE, legacyEnabled: { data: false, loading: true, error: null } }, controller: null });
    expect(renderToStaticMarkup(tree)).toContain("确认中…");
    expect(elements(tree).find((element) => element.type === Button)!.props.disabled).toBe(true);
  });
  it("places diagnostics only in More while preserving connection → phone → filters → records", () => {
    const state: ActivityState = { ...INITIAL_ACTIVITY_STATE, legacyEnabled: failed(new ApiError("independent", 503)) };
    vi.spyOn(hooks, "useActivity").mockReturnValue({ state, controller: null, connection: "connected", reconnect: vi.fn() });
    let tree: React.ReactNode;
    function Capture() { tree = ActivityView({}); return null; }
    renderToStaticMarkup(<Capture />);
    const nodes = elements(tree), content = nodes.find((element) => element.props["aria-label"] === "活动日志页面内容")!;
    const primary = React.Children.toArray(content.props.children as React.ReactNode).filter(React.isValidElement);
    expect(primary.map((element) => element.type)).toEqual([ActivityPageFeedback, PhoneStatusPanel, ActivityControls, ActivityTimeline]);
    const header = nodes.find((element) => element.type === PageHeader)!;
    const popup = elements(header.props.actions as React.ReactNode).find((element) => element.type === PopoverContent)!;
    expect(elements(popup).find((element) => element.type === ActivityLinkageDetails)?.props.state).toBe(state);
    expect(popup.props.className).toContain("max-h-(--available-height)");
    expect(popup.props.className).toContain("overflow-y-auto");
    expect(renderToStaticMarkup(<ActivityView />)).not.toMatch(/旧版联动配置暂不可用|独立诊断详情|AI 活动参考/);
  });
});
