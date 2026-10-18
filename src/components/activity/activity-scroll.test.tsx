vi.mock("@/components/ui/toast", () => ({ useFeedbackToast: vi.fn() }));
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_ACTIVITY_STATE, type ActivityState } from "@/application/activity/activity-state";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { ActivityView } from "./ActivityView";
import * as hooks from "./useActivity";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef) };
});

afterEach(() => vi.restoreAllMocks());

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
function area(state: ActivityState) {
  vi.spyOn(hooks, "useActivity").mockReturnValue({ state, controller: null, connection: "connected", reconnect: vi.fn() });
  const stateSpy = vi.spyOn(React, "useState").mockImplementation(((value: unknown) => [value, vi.fn()]) as unknown as typeof React.useState);
  const refSpy = vi.spyOn(React, "useRef").mockReturnValue({ current: null });
  try { return elements(ActivityView({})).find((element) => element.type === PageScrollArea)!; }
  finally { stateSpy.mockRestore(); refSpy.mockRestore(); }
}
describe("Activity page scrolling", () => {
  it("uses the shared owner and only changes its reset key for range/device navigation", () => {
    const original = area(INITIAL_ACTIVITY_STATE);
    expect(original.props.label).toBe("活动日志页面内容");
    expect(original.props.topLabel).toBe("回到活动日志顶部");
    expect(area({ ...INITIAL_ACTIVITY_STATE, logs: { data: [], loading: false, error: null } }).props.resetKey).toBe(original.props.resetKey);
    expect(area({ ...INITIAL_ACTIVITY_STATE, query: { kind: "date", date: "2026-10-17" } }).props.resetKey).not.toBe(original.props.resetKey);
    expect(area({ ...INITIAL_ACTIVITY_STATE, device: "phone" }).props.resetKey).not.toBe(original.props.resetKey);
  });
  it("keeps phone/Wi-Fi configuration, controls and timeline in one natural flow", () => {
    const owner = area(INITIAL_ACTIVITY_STATE);
    const html = renderToStaticMarkup(owner.props.children as React.ReactNode);
    expect(html).toContain("家庭网络");
    expect(html).toContain("活动时间范围");
    expect(html).not.toContain("overflow-y-auto");
    const timeline = html.match(/<section[^>]*aria-label="活动时间线"[^>]*>/)?.[0];
    expect(timeline).toBeDefined();
    expect(timeline).not.toMatch(/flex-1|min-h-0|max-h-/);
  });
});
