import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { DesktopApps } from "@/components/desktop/DesktopApps";
import { EditorialQuickApps } from "@/components/desktop-v2/EditorialQuickApps";
import { EditorialDesktop } from "@/components/desktop-v2/EditorialDesktop";
import { Desktop } from "@/widgets/Desktop";
import { DesktopAppView, DESKTOP_APP_META } from "@/components/apps/DesktopAppView";
import { TodoWidget } from "@/widgets/TodoWidget";
import { CalendarWidget } from "@/widgets/CalendarWidget";
import { TodayPanel } from "@/components/desktop-v2/EditorialPanels";
import { ScheduleRuntime } from "./ScheduleRuntime";
import ScheduleView from "./ScheduleView";

afterEach(() => vi.unstubAllGlobals());
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as ReactNode)] : []);
}
describe("existing flat app entrances", () => {
  it.each([DesktopApps, EditorialQuickApps])("opens the three existing application IDs from both desktop styles", (Shortcuts) => {
    const onLaunch = vi.fn(), tree = Shortcuts({ onLaunch, onSettings: vi.fn() });
    for (const [id, name] of [["calendar", "记挂"], ["todo", "待办"], ["clock", "闹钟"]] as const) {
      expect(DESKTOP_APP_META[id].name).toBe(name);
      const button = elements(tree).find((node) => node.props["aria-label"] === `打开${name}`)!;
      (button.props.onClick as () => void)(); expect(onLaunch).toHaveBeenLastCalledWith(id);
    }
  });
  it.each(["calendar", "todo", "clock"] as const)("routes Classic and Editorial's %s to the shared real app shell", (id) => {
    for (const [Component, pathname] of [[Desktop, `/app/${id}`], [EditorialDesktop, `/editorial/app/${id}`]] as const) {
      vi.stubGlobal("window", { location: { pathname }, innerWidth: 390 });
      const html = renderToStaticMarkup(<Component />);
      expect(html).toContain('data-testid="desktop-app-view"'); expect(html).not.toContain("页面还在搭建中");
    }
    const html = renderToStaticMarkup(<DesktopAppView appId={id} onBack={vi.fn()} />);
    expect(html).not.toContain("desktop-app-mini-icon"); expect(html).not.toContain("页面还在搭建中");
    if (id === "clock") {
      // The shells lazy-load this shared page; static SSR of the shell itself shows its fallback.
      const clock = renderToStaticMarkup(<ScheduleView kind="alarm" onBack={vi.fn()} />);
      expect(clock).toContain('aria-label="定时功能"'); expect(clock).toContain("定时查岗"); expect(clock.match(/data-selection="filter"/g)).toHaveLength(2);
    }
  });
  it.each(["/", "/app/todo", "/editorial", "/editorial/app/clock"])("keeps online alarm reception mounted above pages at %s", (pathname) => {
    vi.stubGlobal("window", { location: { pathname } }); const tree = App();
    expect(tree.type).toBe(ScheduleRuntime);
    const child = tree.props.children as ReactElement;
    expect(child.type).toBe(pathname.startsWith("/editorial") ? EditorialDesktop : Desktop);
  });
  it("marks demonstration widgets and removes the hardcoded daily schedule count", () => {
    expect(renderToStaticMarkup(<TodoWidget />)).toContain("示例清单 · 未同步");
    expect(renderToStaticMarkup(<TodayPanel onOpen={vi.fn()} />)).toContain("示例清单 · 未同步");
    const calendar = renderToStaticMarkup(<CalendarWidget />); expect(calendar).toContain("未同步记挂"); expect(calendar).not.toContain("今日日程");
  });
});
