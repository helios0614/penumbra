import { expect, it } from "vitest";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GlobalSearchSummary, formatGlobalSearchRange } from "./GlobalSearchSummary";

const stamp = (year: number, month: number, day: number) => new Date(year, month - 1, day, 11, 34, 12).getTime() / 1000;
const recent = { start: stamp(2026, 9, 26), end: stamp(2026, 10, 26) };
const earlier = { start: stamp(2026, 8, 27), end: recent.start };
const render = (range = recent, count = 9, status: ComponentProps<typeof GlobalSearchSummary>["status"] = "ready") =>
  renderToStaticMarkup(<GlobalSearchSummary range={range} count={count} status={status} />);

it("shows local month/day endpoints and a loaded count without time or total-count language", () => {
  expect(formatGlobalSearchRange(recent)).toBe("9/26 — 10/26");
  const html = render();
  expect(html).toContain("已找到 9 条"); expect(html).toContain("9/26 — 10/26");
  for (const text of ["当前时间段", "不含结束时刻", "公开消息", "11:34", "共 9", "已查完"]) expect(html).not.toContain(text);
});

it("includes both endpoint years when the local calendar crosses New Year", () => {
  expect(formatGlobalSearchRange({ start: stamp(2025, 12, 20), end: stamp(2026, 1, 19) })).toBe("2025/12/20 — 2026/1/19");
});

it("shows the currently requested earlier interval while keeping the cumulative count during continuation", () => {
  const html = render(earlier, 12, "loading");
  expect(html).toContain("8/27 — 9/26"); expect(html).toContain("已找到 12 条");
  expect(html).not.toContain("10/26"); expect(html).not.toContain("共 12");
  expect(render(earlier, 12, "complete")).toContain("已找到 12 条");
});

it.each([
  ["loading", "查找中…"], ["scan_pending", "尚未查完"], ["complete", "本段未找到"],
  ["paused", "已停止"], ["error", "查找未完成"],
] as const)("keeps an empty %s state distinct from an exhausted full-history search", (status, label) => {
  const html = render(recent, 0, status);
  expect(html).toContain(label); expect(html).toContain("9/26 — 10/26");
  expect(html).not.toContain("共"); expect(html).not.toContain("全部没有");
});

it("keeps the existing initial empty-search hint when no request range exists", () => {
  const html = renderToStaticMarkup(<GlobalSearchSummary range={null} count={0} status="idle" />);
  expect(html).toContain("每次继续只查一批，找到后可以随时停止。");
  expect(html).not.toContain("未找到");
});
