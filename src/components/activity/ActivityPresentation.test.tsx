import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseActivityRecords } from "@/domain/activity/activity-mappers";
import { parseDeviceStatus } from "@/domain/device-context/device-context-mappers";
import { INITIAL_ACTIVITY_STATE, type ActivityState } from "@/application/activity/activity-state";
import { eventDate, eventTime, sampleMinute, sampleTime } from "@/application/activity/activity-presentation";
import { projectActivityTimeline, timelineEvents } from "@/application/activity/activity-timeline";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityView } from "./ActivityView";
import { PhoneStatusPanel } from "./PhoneStatusPanel";
import { WifiSceneSettings } from "./WifiSceneSettings";
import { ActivityRepeatContents, ActivityRepeatGroup, ActivityTimeline, ActivityTimelineRow } from "./ActivityTimeline";
import { ActivityControls } from "./ActivityControls";
import { ACTIVITY_CLEAR_DESCRIPTION, ActivitySummaryContent } from "./ActivityDialogs";
import * as hooks from "./useActivity";

const group = { availability: "available", observed_at: 1000, received_at: 1001, sample_seq: 1, fresh: true, reason: "fresh", expires_at: 7200 };
const status = parseDeviceStatus({ device_id: "primary", evaluated_at: 1100, battery: { ...group, level: 64, power_connected: false, charging: false }, wifi: { ...group, observed_at: 1050, connected: true, scene: "home", expires_at: 7250 } });
const rows = parseActivityRecords({ entries: [{ timestamp: 1000, time: "18:00:00", date: "2026-10-17", device: "pc", app: "Chrome", title: "<script>原始标题</script>" }, { timestamp: 1060, time: "18:01:00", date: "2026-10-17", device: "phone", app: "锁屏", title: "" }] });
const loaded: ActivityState = { ...INITIAL_ACTIVITY_STATE, clockNow: 100,
  phone: { data: { status, startedAt: 100 }, loading: false, error: null }, visibility: { data: true, loading: false, error: null }, logs: { data: rows, loading: false, error: null }, dates: { data: ["2026-10-17"], loading: false, error: null },
  wifi: { data: { revision: 1, mappings: [{ ssid: "合成家庭网络", scene: "home" }], cacheMaxAgeSeconds: 86400 }, loading: false, error: null } };
afterEach(() => vi.restoreAllMocks());
const renderPhone = (state: ActivityState) => renderToStaticMarkup(<TooltipProvider><PhoneStatusPanel state={state} controller={null} /></TooltipProvider>);

describe("Activity feature presentation", () => {
  it("uses the actual PageHeader/close contract and avoids decorative images/old AI linkage switch", () => {
    const html = renderToStaticMarkup(<ActivityView onBack={vi.fn()} />);
    expect(html).toContain('aria-labelledby="activity-page-title"'); expect(html).toContain('id="activity-page-title"');
    expect(html).toContain("ACTIVITY LOG"); expect(html).toContain("设备上的点滴活动，构成一天的轨迹。"); expect(html).toContain('aria-label="返回桌面"');
    expect(html).not.toContain("<img"); expect(html).not.toMatch(/[📱💻🔋📋🗑]/u); expect(html).not.toContain("AI联动");
  });
  it("renders independent battery/Wi-Fi samples, power and charging rather than assuming they match", () => {
    const html = renderPhone(loaded);
    expect(html).toContain("64%"); expect(html).not.toContain("未连接电源"); expect(html).toContain("未充电"); expect(html).toContain("家里");
    expect(html).toContain("允许 AI 查看手机状态"); expect(html).not.toContain("刷新读取已保存的手机快照");
    expect(html).toContain(`电量有效采样：${sampleTime(1000)}`); expect(html).toContain(`Wi-Fi有效采样：${sampleTime(1050)}`);
    const visible = html.replace(/<[^>]*>/g, "");
    expect(visible).toContain(sampleMinute(1000)); expect(visible).toContain(sampleMinute(1050));
    expect(visible).not.toContain("1970-01-01"); expect(visible).not.toContain("08:16:40");
  });
  it("aligns each phone icon with its main state and leaves description/sample time outside that heading", () => {
    const html = renderPhone(loaded);
    expect(html).toContain('class="activity-phone-metrics pb-2"');
    for (const [icon, value, description, timestamp] of [
      ["battery", "64%", "未充电", 1000], ["wifi", "家里", "已连接 Wi-Fi", 1050],
    ] as const) {
      const column = html.match(new RegExp(`<div class="min-w-0 py-1"><div class="([^"]+)">(<svg[^>]+lucide-${icon}[^>]*>[\\s\\S]*?</svg>)<p[^>]*>${value}</p></div><p[^>]*>${description}</p>(<time[^>]*>[\\s\\S]*?</time>)</div>`));
      expect(column, `${icon} heading and left-aligned metadata`).not.toBeNull();
      expect(column![1]).toContain("items-center");
      expect(column![3]).toContain(new Date(timestamp * 1000).toISOString());
      expect(column![3]).toContain(`更新 ${sampleMinute(timestamp)}`);
    }
  });
  it("masks one group on its deadline while the other stays readable", () => {
    const html = renderPhone({ ...loaded, clockNow: 100 + (7200-1100)*1000 });
    expect(html).not.toContain("64%"); expect(html).toContain("采样已过期"); expect(html).toContain("家里");
    expect(html).toContain("电量最近采样"); expect(html).toContain("Wi-Fi有效采样");
  });
  it.each(["permission_denied", "unknown", "unavailable"])("displays unavailable phone state and permission hints: %s", (availability) => {
    const next = { ...status, wifi: { ...status.wifi, availability: availability as "permission_denied", fresh: false, reason: "unavailable", expiresAt: null, connected: null, scene: "unknown" as const } };
    const html = renderPhone({ ...loaded, phone: { data: { status: next, startedAt: 100 }, loading: false, error: null } });
    expect(html).toContain("未知"); expect(html).not.toContain("已连接 Wi-Fi");
    if (availability === "permission_denied") expect(html).toContain("手机权限未授予");
  });
  it("keeps Wi-Fi settings folded, displays capability limits and saves only user-entered names", () => {
    const html = renderToStaticMarkup(<WifiSceneSettings state={loaded} controller={null} />);
    expect(html.match(/<details[^>]*>/)?.[0]).not.toContain("open");
    expect(html).toContain("当前页面无法读取手机网络名称"); expect(html).toContain("合成家庭网络");
    expect(html).toContain("改为公司"); expect(html).toContain("移除"); expect(html).toContain("添加网络标记");
    expect(html).not.toContain("<form"); expect(html).not.toContain("网络名称（SSID）");
    expect(html).not.toContain("已读取当前 SSID");
  });
  it("shows read/config failures and keeps recovery low-risk and explicit", () => {
    const state = { ...loaded, visibility: { data: null, loading: false, error: "failed" }, wifi: { data: null, loading: false, error: "配置读取失败" } };
    const html = renderPhone(state);
    expect(html).toContain("重新读取权限"); expect(html).toContain("重新读取标记"); expect(html).toContain('disabled=""');
  });
  it("uses event counts, only three device filters and backend date semantics", () => {
    const html = renderToStaticMarkup(<TooltipProvider><ActivityControls state={loaded} controller={null} /></TooltipProvider>);
    const timeline = renderToStaticMarkup(<ActivityTimeline state={loaded} controller={null} />);
    expect(timeline).toContain("共 2 条事件 · 电脑 1 · 手机 1"); expect(html).toContain("最近 3 小时");
    const history = renderToStaticMarkup(<TooltipProvider><ActivityControls state={{ ...loaded, query: { kind: "date", date: "2026-10-17" } }} controller={null} /></TooltipProvider>);
    expect(history).toContain("按日查看"); expect(history).toContain('aria-label="选择日志归档日期"'); expect(history).toContain(">2026-10-17</button>");
    expect(html).toContain("电脑"); expect(html).toContain("手机"); expect(html).not.toContain("使用次数");
  });
  it("shows loading/empty/error in one continuous timeline and escapes event/title text", () => {
    const loading = renderToStaticMarkup(<ActivityTimeline state={{ ...INITIAL_ACTIVITY_STATE, logs: { data: null, loading: true, error: null } }} controller={null} />);
    expect(loading).toContain("正在读取活动记录");
    expect(renderToStaticMarkup(<ActivityTimeline state={{ ...loaded, device: "phone", logs: { data: [], loading: false, error: null } }} controller={null} />)).toContain("暂无手机活动记录");
    expect(renderToStaticMarkup(<ActivityTimeline state={{ ...loaded, logs: { data: null, loading: false, error: "读取失败" } }} controller={null} />)).toContain("重新读取活动");
    const html = renderToStaticMarkup(<ActivityTimeline state={loaded} controller={null} />);
    expect(html).toContain("屏幕关闭"); expect(html).toContain("打开了 Chrome"); expect(html).toContain("&lt;script&gt;原始标题&lt;/script&gt;"); expect(html).not.toContain("<script>");
    expect(html).not.toContain("连续使用"); expect(html).not.toContain('aria-label="更多事件操作"');
  });
  it("limits initial DOM work to 200 rows while keeping the full query count visible", () => {
    const many = parseActivityRecords({ entries: Array.from({ length: 10_000 }, (_, n) => ({ timestamp: 1000+n, time: "00:00:00", date: "2026-10-17", device: "pc", app: "Chrome", title: "" })) });
    const html = renderToStaticMarkup(<ActivityTimeline state={{ ...loaded, logs: { data: many, loading: false, error: null } }} controller={null} />);
    expect(html.match(/data-activity-event-key=/g)).toHaveLength(200); expect(html).toContain("已呈现 200 / 10000 条事件"); expect(html).toContain("继续显示"); expect(many).toHaveLength(10_000);
  });
  it("omits duplicate date headings for both grouped and ordinary archive rows", () => {
    const timestamp = new Date(2026, 9, 17, 22, 8, 16).getTime() / 1000;
    const source = parseActivityRecords({ entries: [
      { timestamp, time: "22:08:16", device: "phone", app: "QQ", title: "com.tencent.mobileqq", date: "2026-10-17" },
      { timestamp: timestamp + 60, time: "22:09:16", device: "phone", app: "QQ", title: "com.tencent.mobileqq", date: "2026-10-17" },
      { timestamp: timestamp + 120, time: "22:10:16", device: "phone", app: "screen_off", title: "", date: "2026-10-17" },
    ] });
    const html = renderToStaticMarkup(<ActivityTimeline state={{ ...loaded, query: { kind: "date", date: "2026-10-17" }, logs: { data: source, loading: false, error: null } }} controller={null} />);
    expect(html).toContain(">归档记录</h2>"); expect(html).toContain("共 3 条事件");
    expect(html).toContain("连续 2 条上报"); expect(html).toContain("屏幕关闭");
    expect(html).not.toContain("<h3"); expect(html.replace(/<[^>]*>/g, "")).not.toContain("2026-10-17");
  });
  it("keeps date separators when a recent range crosses local midnight", () => {
    const before = new Date(2026, 9, 17, 23, 59, 16).getTime() / 1000;
    const after = new Date(2026, 9, 18, 0, 1, 17).getTime() / 1000;
    const source = parseActivityRecords({ entries: [
      { timestamp: before, time: "23:59:16", device: "phone", app: "screen_off", title: "", date: "2026-10-17" },
      { timestamp: after, time: "00:01:17", device: "phone", app: "screen_on", title: "", date: "2026-10-18" },
    ] });
    const html = renderToStaticMarkup(<ActivityTimeline state={{ ...loaded, logs: { data: source, loading: false, error: null } }} controller={null} />);
    expect(html.match(/<h3[^>]*>[^<]*<\/h3>/g)).toEqual([
      expect.stringContaining(`>${eventDate(after)}</h3>`), expect.stringContaining(`>${eventDate(before)}</h3>`),
    ]);
    expect(html).toContain("共 2 条事件");
  });
  it("retains full timestamps and long supplementary text without one card per event", () => {
    const html = renderToStaticMarkup(<ActivityTimelineRow event={{ ...rows[0], title: "长标题".repeat(1000) }} showDate />);
    expect(html).toContain(new Date(rows[0].timestamp*1000).toISOString()); expect(html).toContain("长标题".repeat(1000)); expect(html).toContain("<details"); expect(html).not.toContain("mist-glass");
  });
  it("keeps the summary independent from active filters, exposes estimates and dangerous clear scope", () => {
    const state = { ...loaded, query: { kind: "date" as const, date: "2020-01-01" }, device: "pc" as const, summary: { data: [{ start: "10:00", end: "10:10", summary: "估算活动", count: 4 }], loading: false, error: null } };
    const html = renderToStaticMarkup(<ActivitySummaryContent state={state} onRetry={vi.fn()} />);
    expect(html).toContain("4 条已观测事件"); expect(html).toContain("估算活动"); expect(html).not.toContain("2020-01-01");
    expect(ACTIVITY_CLEAR_DESCRIPTION).toContain("全部设备、全部日期"); expect(ACTIVITY_CLEAR_DESCRIPTION).toContain("不可撤销"); expect(ACTIVITY_CLEAR_DESCRIPTION).toContain("不仅是当前筛选结果");
  });
  it("reports a disabled legacy flag without adding an editor or disabling rule summaries", () => {
    vi.spyOn(hooks, "useActivity").mockReturnValue({ state: { ...loaded, legacyEnabled: { data: false, loading: false, error: null } }, controller: null, connection: "connected", reconnect: vi.fn() });
    const html = renderToStaticMarkup(<ActivityView onBack={vi.fn()} />);
    expect(html).toContain("旧版活动联动配置已关闭"); expect(html).toContain("日志和本页规则摘要仍可查看"); expect(html).not.toContain("条数代表上报事件");
    const source = readFileSync(new URL("ActivityView.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/setClear\(true\)/); expect(source).toMatch(/onConfirm=.*clearAll/s); expect(source).not.toContain("scrollIntoView");
  });
  it("omits normal connection/technical prose but preserves reconnect recovery feedback", () => {
    const hook = vi.spyOn(hooks, "useActivity");
    hook.mockReturnValue({ state: loaded, controller: null, connection: "connected", reconnect: vi.fn() });
    const normal = renderToStaticMarkup(<ActivityView />);
    expect(normal).not.toContain("活动通知已连接"); expect(normal).not.toContain("浏览器时区"); expect(normal).not.toContain("定期核对完整记录");
    hook.mockReturnValue({ state: loaded, controller: null, connection: "reconnecting", reconnect: vi.fn() });
    const error = renderToStaticMarkup(<ActivityView />);
    expect(error).toContain("实时连接中断"); expect(error).toContain("重新连接");
  });
  it("does not render duplicate package details or arrows, but keeps meaningful longer titles expandable", () => {
    const metadata = renderToStaticMarkup(<ActivityTimelineRow event={{ ...rows[0], device: "phone", app: "QQ", title: "com.tencent.mobileqq" }} />);
    expect(metadata).not.toContain("<details"); expect(metadata.replace(/<[^>]*>/g, "").match(/com\.tencent\.mobileqq/g)).toHaveLength(1);
    const short = renderToStaticMarkup(<ActivityTimelineRow event={{ ...rows[0], title: "窗口标题" }} />);
    expect(short).not.toContain("<details"); expect(short).toContain("窗口标题");
    expect(renderToStaticMarkup(<ActivityTimelineRow event={{ ...rows[0], title: "多行\n详细信息" }} />)).toContain("<details");
  });
  it("renders repeat groups closed, and the actual expanded body contains all original rows in order", () => {
    const source = parseActivityRecords({ entries: [0, 60, 120, 180].map((offset) => ({ timestamp: 1000+offset, time: "server time", date: "2026-10-17", device: "phone", app: "QQ", title: "com.tencent.mobileqq" })) });
    const entry = projectActivityTimeline(source)[0];
    if (entry.kind !== "repeat") throw new Error("expected group");
    const closed = renderToStaticMarkup(<ActivityRepeatGroup entry={entry} />);
    expect(closed).toContain("连续 4 条上报"); expect(closed).not.toContain('open=""'); expect(closed).not.toContain("data-activity-event-key");
    const expanded = renderToStaticMarkup(<ActivityRepeatContents events={entry.events} />);
    expect(expanded.match(/data-activity-event-key=/g)).toHaveLength(4);
    let previous = -1;
    for (const event of timelineEvents(entry)) {
      const position = expanded.indexOf(new Date(event.timestamp*1000).toISOString());
      expect(position).toBeGreaterThan(previous); previous = position;
      expect(expanded).toContain(`>${eventTime(event.timestamp)}</time>`);
    }
    const timeline = renderToStaticMarkup(<ActivityTimeline state={{ ...loaded, logs: { data: source, loading: false, error: null } }} controller={null} />);
    expect(timeline).toContain("共 4 条事件"); expect(timeline).toContain("连续 4 条上报"); expect(timeline).not.toContain("连续使用");
  });
  it("uses the same time/device/content/arrow columns for grouped and ordinary rows", () => {
    const timestamp = new Date(2026, 9, 17, 22, 8, 16).getTime() / 1000;
    const source = parseActivityRecords({ entries: [0, 60, 120, 180, 300].map((offset) => ({ timestamp: timestamp + offset, time: "server time", date: "2026-10-17", device: "phone", app: "QQ", title: "com.tencent.mobileqq" })) });
    const entry = projectActivityTimeline(source)[0];
    if (entry.kind !== "repeat") throw new Error("expected group");
    const grouped = renderToStaticMarkup(<ActivityRepeatGroup entry={entry} />);
    const ordinary = renderToStaticMarkup(<ActivityTimelineRow event={{ ...source[0], title: "多行\n详细信息" }} />);
    const groupSummary = grouped.match(/<summary class="([^"]+)">([\s\S]*?)<\/summary>/)!;
    const rowSummary = ordinary.match(/<summary class="([^"]+)">([\s\S]*?)<\/summary>/)!;
    expect(groupSummary[1]).toContain("grid ");
    expect(groupSummary[1]).toBe(rowSummary[1]);
    expect(groupSummary[2].replace(/<[^>]*>/g, "")).toBe("22:08–22:13手机打开了 QQcom.tencent.mobileqq连续 5 条上报");
    expect(groupSummary[2]).toMatch(/^<span[^>]*>22:08–22:13<\/span><span[^>]*><svg/);
    for (const summary of [groupSummary[2], rowSummary[2]]) {
      expect(summary).toMatch(/<\/span><svg[^>]+lucide-chevron-down[^>]*>[\s\S]*<\/svg>$/);
    }
    expect(grouped).toContain(`${sampleTime(timestamp)}–${sampleTime(timestamp + 300)}`);
  });
  it("shows a package-only group name once without repeating it as secondary metadata", () => {
    const source = parseActivityRecords({ entries: [0, 60].map((offset) => ({ timestamp: 1000 + offset, time: "server time", date: "2026-10-17", device: "phone", app: "org.example.reader", title: "org.example.reader" })) });
    const entry = projectActivityTimeline(source)[0];
    if (entry.kind !== "repeat") throw new Error("expected group");
    const html = renderToStaticMarkup(<ActivityRepeatGroup entry={entry} />);
    expect(html.replace(/<[^>]*>/g, "").match(/org\.example\.reader/g)).toHaveLength(1);
    expect(html).toContain("连续 2 条上报"); expect(html).not.toContain('open=""');
  });
});
