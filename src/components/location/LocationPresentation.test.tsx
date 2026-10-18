import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_LOCATION_STATE } from "@/application/location/location-state";
import { draftFromConfig } from "@/application/location/location-draft";
import { configDto, locationConfig, locationStatus } from "@/domain/location/location-fixtures";
import { parseLocationConfig } from "@/domain/location";
import { DESKTOP_APP_META, DesktopAppView, isDesktopAppId } from "@/components/apps/DesktopAppView";
import { DesktopApps } from "@/components/desktop/DesktopApps";
import { EditorialQuickApps } from "@/components/desktop-v2/EditorialQuickApps";
import { LocationPage } from "./LocationView";
import { LocationQuietHours } from "./LocationQuietHours";
import { TooltipProvider } from "@/components/ui/tooltip";
import { locationSummary } from "./location-presentation";

const loaded = () => { const config = locationConfig(); return { ...INITIAL_LOCATION_STATE, config, status: locationStatus(), baseline: draftFromConfig(config), draft: draftFromConfig(config) }; };
describe("Location page presentation", () => {
  it("registers both desktop entrances and the real lazy app without a second outer header", () => {
    expect(isDesktopAppId("location")).toBe(true); expect(DESKTOP_APP_META.location.name).toBe("定位");
    for (const Page of [DesktopApps, EditorialQuickApps]) expect(renderToStaticMarkup(<Page onLaunch={vi.fn()} onSettings={vi.fn()} />)).toContain('aria-label="打开定位"');
    const html = renderToStaticMarkup(<DesktopAppView appId="location" onBack={vi.fn()} />);
    expect(html).not.toContain("页面还在搭建中"); expect(html).not.toContain("desktop-app-mini-icon");
  });
  it("uses the shared header, exposes quiet hours and keeps only advanced configuration folded", () => {
    const html = renderToStaticMarkup(<LocationPage state={loaded()} controller={null} connection="connected" reconnect={vi.fn()} />);
    expect(html).toContain('aria-labelledby="location-page-title"'); expect(html).toContain('id="location-page-title"'); expect(html).toContain("LOCATION");
    expect(html).toContain("统一时段"); expect(html).toContain("工作日专用时段"); expect(html).toContain("休息日专用时段");
    expect(html.match(/<details/g)).toHaveLength(1); expect(html.match(/<details[^>]*>/)?.[0]).not.toMatch(/\sopen(?:=|>)/);
    expect(html).toContain('aria-label="刷新显示"'); expect(html).toContain("最近的位置与天气，还有身边的小发现。"); expect(html).toContain("小雨 21°C");
    expect(html).toContain("选择希望暂停定位的时间段"); expect(html).toContain("留空则不更换");
    expect(html.match(/GCJ-02/g)).toHaveLength(1);
    expect(html).not.toMatch(/后端允许采集|非浏览器实时定位|缓存天气|默认回退|开始包含|生效时间：|最多十条|修改后统一保存|最小 50 米|500–10000 米|编辑后使用上方/);
    expect(html).not.toMatch(/<iframe|<canvas|📍|🏠|🗺/u);
  });
  it("preserves six raw input values and renders seven accessible manually selected days including none", () => {
    const state = loaded(); state.draft.weekday_days = ""; state.draft.quiet_hours_weekday_end = "09:25";
    const html = renderToStaticMarkup(<TooltipProvider><LocationQuietHours state={state} controller={null} /></TooltipProvider>);
    expect(html.match(/type="time"/g)).toHaveLength(6); expect(html.match(/aria-pressed="false"/g)).toHaveLength(7);
    expect(html).not.toContain('aria-pressed="true"'); expect(html).toContain("所有日期均为休息日");
    expect(html).toContain("沿用统一 00:00"); expect(html).not.toContain("00:00–09:25");
    expect(html.match(/<input[^>]*id="location-quiet_hours_weekday_start"[^>]*>/)?.[0]).toContain('value=""');
    expect(html.match(/<input[^>]*id="location-quiet_hours_weekday_end"[^>]*>/)?.[0]).toContain('value="09:25"');
    expect(html.match(/<label[^>]*>开始<\/label>/g)).toHaveLength(3); expect(html.match(/<label[^>]*>结束<\/label>/g)).toHaveLength(3);
    expect(html).toContain("min-w-11"); expect(html).toContain('aria-label="清除工作日专用时段结束"');
    expect(html).not.toContain('aria-label="清除工作日专用时段开始"'); expect(html).not.toContain("沿用统一时段");
    state.draft.weekday_days = "1,2,7";
    const selected = renderToStaticMarkup(<LocationQuietHours state={state} controller={null} />);
    expect(selected.match(/aria-pressed="true"/g)).toHaveLength(3); expect(selected).not.toContain("工作日：");
    state.draft.quiet_hours_start = "23:00";
    expect(renderToStaticMarkup(<LocationQuietHours state={state} controller={null} />)).toContain("跨午夜");
    state.draft.quiet_hours_end = "23:00";
    expect(renderToStaticMarkup(<LocationQuietHours state={state} controller={null} />)).toContain("起止相同，无静默时长");
  });
  it("shows zero distance only with valid home and position, while keeping old/disabled records explicit", () => {
    const state = loaded(), now = state.status.updatedAt! * 1000;
    expect(locationSummary(state, now)).toMatchObject({ distance: 0, label: "在家", older: false });
    expect(locationSummary({ ...state, status: { ...state.status, state: "unknown" } }, now).distance).toBeNull();
    state.config = parseLocationConfig({ ...configDto, enabled: false, active: false });
    expect(locationSummary(state, now + 31 * 60_000)).toMatchObject({ enabled: false, collection: "定位已关闭", older: true });
    state.config.values.home_lng = 0; state.config.values.home_lat = 0;
    expect(locationSummary(state).distance).toBeNull();
    state.status = { ...state.status, coordinate: null, updatedAt: Date.now() / 1000 - 31 * 60 }; expect(locationSummary(state).label).toBe("未知");
    const html = renderToStaticMarkup(<LocationPage state={state} controller={null} connection="connected" reconnect={vi.fn()} />);
    expect(html).toContain("定位已关闭"); expect(html).toContain("尚未设置家庭位置"); expect(html).toContain("较早的定位记录");
    expect(html).not.toContain("距家 0 m");
  });
  it("keeps failed reads, pending distance recomputation and ambiguous empty POI results honest", () => {
    const state = { ...loaded(), homeAwaitingReport: 1, statusError: "连接中断", configError: "未登录", validation: { poi_radius: "请填写 500–10000 之间的整数" } };
    expect(locationSummary(state).distance).toBeNull();
    const html = renderToStaticMarkup(<LocationPage state={state} controller={null} connection="blocked" reconnect={vi.fn()} />);
    expect(html).toContain("配置读取失败"); expect(html).toContain("显示上次记录"); expect(html).toContain("状态与距离待更新");
    expect(html).toContain("请填写 500–10000 之间的整数");
    expect(html).toContain("暂未获取到地点，可稍后重试。"); expect(html).not.toContain("附近没有地点");
    expect(html).not.toContain("fake-ref");
  });
});
