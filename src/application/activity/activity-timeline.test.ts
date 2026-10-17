import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@/domain/activity";
import { parseActivityRecords } from "@/domain/activity/activity-mappers";
import { activityCounts } from "./activity-presentation";
import { activityEventDetails, activityRawAppIdentity, filterActivityTimeline, projectActivityTimeline, timelineEvents } from "./activity-timeline";

const base = Date.parse("2026-10-17T10:00:00Z") / 1000;
const event = (offset: number, changes: Partial<ActivityEvent> = {}): ActivityEvent => ({ timestamp: base + offset, time: "server time", date: "2026-10-17", device: "phone", app: "QQ", title: "com.tencent.mobileqq", ...changes });
const records = (...input: ActivityEvent[]) => parseActivityRecords({ entries: input });
const project = (...input: ActivityEvent[]) => projectActivityTimeline(records(...input), "Asia/Shanghai");

describe("Conservative frontend repeat projection", () => {
  it("folds two or more adjacent app samples and preserves every original record, time and order", () => {
    const source = records(event(0), event(60), event(120), event(180));
    const before = JSON.stringify(source);
    const result = projectActivityTimeline(source, "Asia/Shanghai");
    expect(result).toHaveLength(1); expect(result[0].kind).toBe("repeat");
    expect(timelineEvents(result[0])).toEqual(source);
    expect(timelineEvents(result[0]).map((row) => row.timestamp)).toEqual([base+180, base+120, base+60, base]);
    expect(JSON.stringify(source)).toBe(before); expect(activityCounts(source).all).toBe(4);
  });
  it("keeps a single sample as an individual event", () => expect(project(event(0))[0].kind).toBe("event"));
  it("does not merge the same display name with different original packages", () => {
    expect(project(event(0), event(60, { title: "other.vendor.qq" }))).toHaveLength(2);
  });
  it("does not guess an original package from a resolved display label", () => {
    expect(project(event(0, { title: "" }), event(60, { title: "" }))).toHaveLength(2);
    expect(project(event(0, { title: "QQ" }), event(60, { title: "QQ" }))).toHaveLength(2);
  });
  it("does not select a winner when app and title contain conflicting identities", () => {
    expect(activityRawAppIdentity(records(event(0, { app: "com.foo.one", title: "com.foo.two" }))[0])).toBeNull();
  });
  it.each(["screen_on", "screen_off", "亮屏", "锁屏"])("never groups the system state %s, even when consecutive", (app) => {
    const result = project(event(0, { app, title: "screen_on" }), event(60, { app, title: "screen_on" }));
    expect(result.map((entry) => entry.kind)).toEqual(["event", "event"]);
  });
  it("does not cross an intervening app, source or system event", () => {
    for (const middle of [{ app: "微信", title: "com.tencent.mm" }, { device: "pc", app: "chrome.exe", title: "page" }, { app: "亮屏", title: "screen_on" }]) {
      expect(project(event(0), event(60, middle), event(120))).toHaveLength(3);
    }
  });
  it("filters after grouping, so hidden other-device events cannot bridge two runs", () => {
    const result = project(event(0), event(60, { device: "pc", app: "chrome.exe", title: "page" }), event(120));
    const phone = filterActivityTimeline(result, "phone");
    expect(phone).toHaveLength(2); expect(phone.every((entry) => entry.kind === "event")).toBe(true);
    expect(filterActivityTimeline(result, "pc")).toHaveLength(1);
  });
  it("accepts a 3-minute adjacent gap but splits longer gaps", () => {
    expect(project(event(0), event(180))).toHaveLength(1);
    expect(project(event(0), event(181))).toHaveLength(2);
  });
  it("splits both server archive date and local display date boundaries", () => {
    expect(project(event(0), event(60, { date: "2026-10-16" }))).toHaveLength(2);
    const midnight = Date.parse("2026-10-16T16:00:00Z") / 1000;
    expect(project(event(0, { timestamp: midnight-30 }), event(0, { timestamp: midnight+30 }))).toHaveLength(2);
  });
  it("only groups intact PC process names with unchanged window details", () => {
    const pc = { device: "pc", app: "chrome.exe", title: "document" };
    expect(project(event(0, pc), event(60, pc))[0].kind).toBe("repeat");
    expect(project(event(0, pc), event(60, { ...pc, title: "different document" }))).toHaveLength(2);
    expect(project(event(0, { ...pc, app: "Chrome" }), event(60, { ...pc, app: "Chrome" }))).toHaveLength(2);
  });
  it("keeps genuinely identical same-timestamp samples and their unique occurrence keys", () => {
    const result = project(event(0), event(0));
    expect(timelineEvents(result[0])).toHaveLength(2);
    expect(new Set(timelineEvents(result[0]).map((row) => row.key)).size).toBe(2);
  });
  it("recomputes stable keys on HTTP/WS reconciliation and retains the oldest anchor when a run grows", () => {
    const first = project(event(0), event(60));
    expect(project(event(60), event(0))[0].key).toBe(first[0].key);
    expect(project(event(120), event(0), event(60))[0].key).toBe(first[0].key);
    const narrowed = project(event(60), event(120));
    expect(timelineEvents(narrowed[0])).toHaveLength(2); expect(narrowed[0].key).not.toBe(first[0].key);
  });
  it("projects 10,000 samples without dropping events or mutating the loaded collection", () => {
    const source = records(...Array.from({ length: 10_000 }, (_, n) => event(n*60)));
    const groups = projectActivityTimeline(source);
    expect(groups.flatMap(timelineEvents)).toEqual(source);
    expect(new Set(groups.map((entry) => entry.key)).size).toBe(groups.length);
  });
});

describe("Useful event details only", () => {
  it.each(["", "QQ", "打开了 QQ", "  QQ  "])("omits redundant/empty title %j", (title) => {
    expect(activityEventDetails(records(event(0, { title }))[0])).toEqual({ secondary: null, preview: null, detail: null });
  });
  it("shows original package metadata once without an expandable duplicate", () => {
    expect(activityEventDetails(records(event(0))[0])).toEqual({ secondary: "com.tencent.mobileqq", preview: null, detail: null });
  });
  it("displays a short meaningful window title in full without an unnecessary toggle", () => {
    expect(activityEventDetails(records(event(0, { device: "pc", title: "合成窗口" }))[0])).toEqual({ secondary: "合成窗口", preview: null, detail: null });
  });
  it("expands only additional multiline/long details and preserves complete original text", () => {
    const title = "原始窗口标题".repeat(100);
    const details = activityEventDetails(records(event(0, { device: "pc", title }))[0]);
    expect(details.detail).toBe(title); expect(details.preview!.length).toBeLessThan(title.length);
    expect(activityEventDetails(records(event(0, { title: "一行\n二行" }))[0]).detail).toBe("一行\n二行");
  });
});
