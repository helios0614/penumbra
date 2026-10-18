import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { INITIAL_ACTIVITY_STATE, activityReadFailure, type ActivityState } from "@/application/activity/activity-state";
import { activityReadGroup, ACTIVITY_PAGE_READS } from "@/application/activity/activity-feedback";
import { ActivityPageFeedback, ActivityReadIssue } from "./ActivityFeedback";
import { ActivityView } from "./ActivityView";
import * as hooks from "./useActivity";

afterEach(() => vi.restoreAllMocks());
function failed(error: unknown) {
  return { data: null, loading: false, error: "请求失败", failure: activityReadFailure(error) };
}
describe("Activity connection feedback", () => {
  it("merges matching network transport failures, retaining module states and one recovery action", () => {
    const state = { ...INITIAL_ACTIVITY_STATE, ...Object.fromEntries(ACTIVITY_PAGE_READS.map((key) => [key, failed(new ApiError("offline", 0))])) } as ActivityState;
    expect(activityReadGroup(state)).toHaveLength(6);
    vi.spyOn(hooks, "useActivity").mockReturnValue({ state, controller: null, connection: "reconnecting", reconnect: vi.fn() });
    const html = renderToStaticMarkup(<ActivityView />);
    expect(html).toContain("连接异常，部分信息暂不可用"); expect(html).toContain("手机状态暂不可用"); expect(html).toContain("活动记录读取失败");
    expect(html.match(/重新读取并恢复连接/g)).toHaveLength(1);
    for (const label of ["重新读取权限", "重新读取标记", "重新读取日期", "重新读取活动", "重新读取配置"]) expect(html).not.toContain(`>${label}<`);
    expect(html).not.toContain("暂无活动"); expect(html).not.toContain("共 0 条事件"); expect(html).not.toContain("text-warning");
    expect(html.match(/NETWORK_ERROR/g)).toHaveLength(6); // Retained only in the shared collapsed diagnostics.
  });
  it("uses structured evidence instead of equal wording; timeouts, 5xx and unrelated auth statuses remain local", () => {
    const sameText = { ...INITIAL_ACTIVITY_STATE, phone: failed(new Error("same")), dates: failed(new Error("same")) };
    expect(activityReadGroup(sameText)).toEqual([]);
    for (const error of [new ApiError("timeout", 0, null, "TIMEOUT"), new ApiError("unavailable", 503), new ApiError("resource forbidden", 403)]) {
      expect(activityReadGroup({ ...INITIAL_ACTIVITY_STATE, phone: failed(error), dates: failed(error) })).toEqual([]);
    }
    expect(activityReadGroup({ ...INITIAL_ACTIVITY_STATE, phone: failed(new ApiError("auth", 401)), dates: failed(new ApiError("auth", 403)) })).toEqual([]);
    expect(activityReadGroup({ ...INITIAL_ACTIVITY_STATE, phone: failed(new ApiError("auth", 401)), dates: failed(new ApiError("auth", 401)) })).toEqual(["phone", "dates"]);
  });
  it("retains recovery for an independent module alongside a grouped outage, and reconciles GET/WS once per click", () => {
    const state = { ...INITIAL_ACTIVITY_STATE, phone: failed(new ApiError("offline", 0)), visibility: failed(new ApiError("offline", 0)), dates: failed(new ApiError("contract", 200, null, "INVALID_RESPONSE")) };
    const retry = vi.fn(), refresh = vi.fn(), reconnect = vi.fn();
    const issue = renderToStaticMarkup(<ActivityReadIssue state={state} name="dates" text="归档日期读取失败" onRetry={retry} />);
    expect(issue).toContain("重新读取日期"); expect(issue).toContain("INVALID_RESPONSE");
    const tree = ActivityPageFeedback({ state, controller: { refresh } as never, connection: "blocked", reconnect });
    if (!tree) throw new Error("Missing page feedback");
    tree.props.children[0].props.children[1].props.onClick();
    expect(refresh).toHaveBeenCalledOnce(); expect(reconnect).toHaveBeenCalledOnce();
    expect(ActivityPageFeedback({ state: INITIAL_ACTIVITY_STATE, controller: null, connection: "connected", reconnect })).toBeNull();
  });
});
