import { afterEach, describe, expect, it, vi } from "vitest";
import { clearActivityLogs, getActivityDates, getActivityEnabled, getActivityRecords, getActivitySummary } from "./activity-client";
import { dateKey, parseActivityEvent, parseActivityRecords, parseActivitySummary } from "./activity-mappers";
import { activityCounts, activityEventLabel, eventDate, eventTime, filterActivity } from "@/application/activity/activity-presentation";

const event = { timestamp: 1792238399.125, time: "服务器原始时间", date: "2026-10-17", device: "pc", app: "chrome.exe", title: "窗口" };
const json = (input: unknown) => new Response(JSON.stringify(input), { headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("Activity event contracts", () => {
  it("keeps timestamp precision, original source and server labels independently", () => {
    expect(parseActivityEvent(event)).toEqual(event);
    expect(eventTime(event.timestamp, "Asia/Shanghai")).not.toBe(event.time);
    const crossDay = Date.parse("2026-10-16T18:00:00Z") / 1000;
    expect(eventDate(crossDay, "Asia/Shanghai")).toBe("2026-10-17");
    expect(eventDate(crossDay, "America/Los_Angeles")).toBe("2026-10-16");
  });
  it("sorts by absolute event time, preserving legitimate identical samples and stable keys", () => {
    const later = { ...event, timestamp: event.timestamp + 60 };
    const rows = parseActivityRecords({ entries: [event, later, event] });
    expect(rows.map((row) => row.timestamp)).toEqual([later.timestamp, event.timestamp, event.timestamp]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
    expect(parseActivityRecords({ entries: [event, event, later] }).map((row) => row.key)).toEqual(rows.map((row) => row.key));
  });
  it("counts events and filters only the complete loaded dataset", () => {
    const rows = parseActivityRecords({ entries: [event, { ...event, device: "phone" }, { ...event, device: "future-device" }] });
    expect(activityCounts(rows)).toEqual({ all: 3, pc: 1, phone: 1 });
    expect(filterActivity(rows, "phone")).toHaveLength(1);
    expect(filterActivity(rows, "all")).toHaveLength(3);
  });
  it.each(["screen_on", "亮屏"])("presents %s as screen-on without changing source", (app) => {
    expect(activityEventLabel({ app })).toBe("屏幕亮起");
  });
  it.each(["screen_off", "锁屏"])("presents %s as screen-off", (app) => expect(activityEventLabel({ app })).toBe("屏幕关闭"));
  it("uses conservative labels and safe literal unknown names", () => {
    expect(activityEventLabel({ app: "微信" })).toBe("打开了 微信");
    for (const app of ["com.vivo.gallery", "unknown.exe", "某个未识别应用", "<script>x</script>"]) expect(activityEventLabel({ app })).toBe(app);
  });
  it.each([NaN, Infinity, -1, "1792238399", null])("rejects invalid event timestamps: %s", (timestamp) => {
    expect(() => parseActivityRecords({ entries: [{ ...event, timestamp }] })).toThrow();
  });
  it.each(["2026-02-30", "2026-13-01", "../data", "2026-1-1"])("rejects invalid date/path: %s", (date) => expect(() => dateKey(date)).toThrow());
  it("keeps all 10,000 returned events without invented pagination", () => {
    const rows = parseActivityRecords({ entries: Array.from({ length: 10_000 }, (_, offset) => ({ ...event, timestamp: event.timestamp + offset })) });
    expect(rows).toHaveLength(10_000);
    expect(new Set(rows.map((row) => row.key)).size).toBe(10_000);
  });
  it("preserves rule-summary text/count and refuses another requested range", () => {
    const row = { start: "23:50", end: "00:00", summary: "估算区间 · 缺少活动数据", count: 4 };
    expect(parseActivitySummary({ hours: 3, summaries: [row] })).toEqual([row]);
    expect(() => parseActivitySummary({ hours: 24, summaries: [row] })).toThrow();
  });
});

describe("Activity HTTP adapter", () => {
  it("requests the real read contracts with cancellation, never page/has_more", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ entries: [event], hours: 3 })).mockResolvedValueOnce(json({ dates: [event.date] })).mockResolvedValueOnce(json({ entries: [event], date: event.date })).mockResolvedValueOnce(json({ hours: 3, summaries: [] })).mockResolvedValueOnce(json({ activity_tracking_enabled: false }));
    vi.stubGlobal("fetch", fetch);
    const abort = new AbortController();
    await getActivityRecords({ kind: "recent", hours: 3 }, { signal: abort.signal });
    expect(await getActivityDates()).toEqual([event.date]);
    await getActivityRecords({ kind: "date", date: event.date });
    await getActivitySummary();
    expect(await getActivityEnabled()).toBe(false);
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toMatch(/\/api\/activity\/recent\?hours=3$/);
    expect(urls[2]).toMatch(/\/api\/activity\/logs\/2026-10-17$/);
    expect(urls[3]).toMatch(/\/api\/activity\/summary\?hours=3$/);
    expect(urls.join()).not.toMatch(/page|has_more/);
    expect(fetch.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("only the explicit clear operation posts and returns a FILE count", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true, deleted: 2 }));
    vi.stubGlobal("fetch", fetch);
    expect(await clearActivityLogs()).toBe(2);
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/activity\/clear$/);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
  });
});
