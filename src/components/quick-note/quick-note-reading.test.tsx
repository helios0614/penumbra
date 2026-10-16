import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LogLine } from "./QuickNoteLogs";
import { quickNoteLogTime, quickNoteLogTone } from "./quick-note-log-presentation";
import { scrollQuickNoteToTop, showQuickNoteTopButton } from "./quick-note-reader-scroll";

describe("Quick Note log presentation", () => {
  it("shows only h23 clock time in the business zone and retains the raw timestamp/full date", () => {
    const ts = Date.parse("2026-10-16T13:09:02Z") / 1000;
    expect(quickNoteLogTime(ts, "Asia/Shanghai")).toEqual({ clock: "21:09:02", full: "2026/10/16 21:09:02", iso: "2026-10-16T13:09:02.000Z" });
    expect(quickNoteLogTime(ts, "Asia/Kolkata").clock).toBe("18:39:02");
    expect(quickNoteLogTime(Date.parse("2026-10-15T16:00:00Z") / 1000, "Asia/Shanghai").clock).toBe("00:00:00");
    expect(quickNoteLogTime(ts)).toEqual({ clock: "—", full: "2026-10-16T13:09:02.000Z", iso: "2026-10-16T13:09:02.000Z" });
    const entry = { ts, level: "info", message: "开始调用", seq: 1 };
    const html = renderToStaticMarkup(<LogLine entry={entry} timeZone="Asia/Shanghai" />);
    expect(html).toContain('dateTime="2026-10-16T13:09:02.000Z"');
    expect(html).toContain('title="2026/10/16 21:09:02"');
    expect(html).toContain(">21:09:02</time>");
    expect(entry.ts).toBe(ts);
  });

  it.each([
    ["success", "Step 1 完成", "success"],
    ["info", "Step 1 完成", "success"],
    ["info", "Step 2 速记完成 ✓", "success"],
    ["info", "正文保存成功", "success"],
    ["ERROR", "Step 2 完成", "error"],
    ["success", "生成完成但保存失败", "error"],
    ["info", "Step 1 完成，Step 2 调用错误", "error"],
    ["warning", "Step 1 完成", "warning"],
    ["warn", "正在重试", "warning"],
    ["warning", "调用失败", "error"],
    ["info", "警告：跳过重复项", "warning"],
    ["info", "[辅助模型] 正在调用…", "info"],
    ["info", "等待 Step 2 完成", "info"],
    ["info", "Step 2 尚未完成", "info"],
    ["info", "Step 2 未完成（502）", "error"],
    ["debug", "任务开始执行", "info"],
    ["future-level", "普通消息", "info"],
    ["info", "request failed after completed step", "error"],
  ] as const)("classifies %s / %s as %s without inferring overall generation state", (level, message, tone) => {
    expect(quickNoteLogTone({ level, message })).toBe(tone);
  });

  it.each([
    ["success", "text-success-foreground"],
    ["error", "text-destructive-foreground"],
    ["warning", "text-warning-foreground"],
    ["info", "text-foreground"],
  ])("uses the existing light/dark semantic ink for %s and keeps the original line", (level, color) => {
    const html = renderToStaticMarkup(<LogLine entry={{ ts: 1792100000, seq: 1, level, message: "原始文本\n下一行" }} timeZone="Asia/Shanghai" />);
    expect(html).toContain(color);
    expect(html).toContain(`[${level}]`);
    expect(html).toContain("原始文本\n下一行");
  });
});

describe("Quick Note reader scroll", () => {
  it("shows the top button after 360px and hides it again near the top", () => {
    expect([0, 100, 360, 361, 900, 120, 0].map(showQuickNoteTopButton)).toEqual([false, false, false, true, true, false, false]);
  });
  it.each([false, true])("scrolls only the reader body to the top, with reduced motion = %s", (reducedMotion) => {
    const reader = { scrollTo: vi.fn(), focus: vi.fn() };
    const overview = { scrollTo: vi.fn(), focus: vi.fn() };
    scrollQuickNoteToTop(reader, reducedMotion);
    expect(reader.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    expect(reader.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(overview.scrollTo).not.toHaveBeenCalled();
    expect(() => scrollQuickNoteToTop(null, reducedMotion)).not.toThrow();
  });
});
