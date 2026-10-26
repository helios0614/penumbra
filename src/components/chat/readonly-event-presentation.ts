import type { Message } from "@/domain/message/message-types";
import type { CapabilityStatus } from "@/domain/message/capability-types";
import type { PublicSearchSegment } from "@/domain/message/message-window";

export type EventField = { key: string; label: string; text: string };
const bodyLabels = new Set(["内容", "提醒内容", "记忆正文", "记忆内容", "记忆正文（旧通知）", "内容（旧通知）", "正文", "结果正文", "旧版系统原文", "旧通知全文", "原始记录", "动态摘要", "动态结果", "位置结果"]);
const memoryMetadataLabels = new Set(["重要度", "关键词", "标签", "ID", "记忆ID", "记忆 ID", "来源", "来源会话"]);
const timeLabels = new Set(["时间", "触发时间", "执行时间", "计划时间"]);
const noticeLabels = new Set(["状态", "错误", "错误信息", "失败原因", "截断说明", "截断状态", "结果截断", "截断标记"]);
const labels: Record<string, string> = { body: "正文", summary: "摘要", preview: "内容预览", server: "服务", tool: "工具", error: "错误", result: "公开结果", query: "查询", title: "来源", domain: "域名", name: "名称", artist: "歌手", album: "专辑" };
const statuses: Record<CapabilityStatus, string> = { success: "已完成", failed: "失败", partial: "部分完成", skipped: "已跳过", timeout: "超时", cancelled: "已中断", unknown: "结果未知", sent: "已发出" };

function fields(segments: readonly PublicSearchSegment[]): EventField[] {
  const byKey = new Map(segments.map(s => [s.segmentKey, s.text]));
  return segments.flatMap(s => {
    const label = s.segmentKey.match(/^display\.label:(\d+)$/);
    if (label) return byKey.has(`display.field:${label[1]}`) ? [] : [{ key: s.segmentKey, label: "公开字段", text: s.text }];
    const field = s.segmentKey.match(/^display\.field:(\d+)$/);
    if (field) return [{ key: s.segmentKey, label: byKey.get(`display.label:${field[1]}`) || "公开字段", text: s.text }];
    const suffix = s.segmentKey.split(".").pop()!;
    return [{ key: s.segmentKey, label: labels[suffix] ?? "公开记录", text: s.text }];
  });
}

function keywordCount(text: string) {
  // A producer-authored string array has an exact count; ordinary prose does
  // not. Do not guess keyword boundaries from commas or other punctuation.
  try { const value: unknown = JSON.parse(text); return Array.isArray(value) && value.every(v => typeof v === "string") ? value.length : null; }
  catch { return null; }
}

/** Text comes exclusively from searchSegments. Capability enums/booleans only
 * supply existing public status and icon semantics, never field/body text. */
export function readonlyEventPresentation(message: Message) {
  const segments = (message.searchSegments ?? []).filter(s => s.segmentKey !== "body" || message.roleKind === "system");
  const rows = fields(segments);
  const title = segments.find(s => s.segmentKey === "display.title");
  const receipts = message.capabilities?.results.filter(r =>
    r.capability === "WEBSEARCH" && segments.some(s => s.segmentKey.startsWith("web:")) ||
    r.capability === "URL_READ" && segments.some(s => s.segmentKey.startsWith("url:"))) ?? [];
  const record = message.roleKind === "system" ? message.capabilities?.display
    : message.capabilities?.results.find(r => r.id === `${message.id}:tools`) ?? receipts[0];
  const notices = rows.filter(row => /^display\.notice:\d+$/.test(row.key) || /^tool:\d+\.error$/.test(row.key) || noticeLabels.has(row.label.trim()));
  const readable = rows.filter(row => row.text.trim());
  // Older public DTOs may carry the body under an unfamiliar/missing field
  // label. A metadata-only summary must not outrank that already-public text.
  const memoryContent = record?.capability === "MEMORY_WRITE" ? readable.find(row =>
    /^display\.field:/.test(row.key) && !memoryMetadataLabels.has(row.label.trim()) && !notices.includes(row) && !timeLabels.has(row.label.trim())) : undefined;
  const primary = readable.find(row => bodyLabels.has(row.label.trim()))
    ?? memoryContent
    ?? readable.find(row => row.key === "display.preview")
    ?? readable.find(row => row.key === "display.summary")
    ?? rows.find(row => /^tool:\d+\.result$/.test(row.key))
    ?? rows.find(row => /^web:\d+\.query$/.test(row.key))
    ?? rows.find(row => row.key !== "display.title" && !notices.includes(row) && !timeLabels.has(row.label) && !["重要度", "关键词", "记忆 ID"].includes(row.label));
  const time = rows.find(row => timeLabels.has(row.label.trim()));
  const timeLabel = time && ["ALARM", "REMINDER"].includes(record?.capability ?? "") && time.label.trim() !== "执行时间" ? "提醒时间" : time?.label;
  const metadata = rows.flatMap(row => {
    if (row.label.trim() === "重要度") return [`重要度 ${row.text}`];
    if (row.label.trim() === "关键词") { const count = keywordCount(row.text); return count === null ? [] : [`关键词 ${count} 个`]; }
    return [];
  });
  const callResult = record?.kind === "result" && !!record.calls.length;
  const status = record?.status ?? "unknown";
  const statusText = callResult && status === "success" ? "调用层完成" : statuses[status];
  const warnings = (record?.calls ?? []).flatMap((call, i) => [
    ...(call.status !== "success" ? [`调用 ${i + 1} · ${statuses[call.status]}`] : []),
    ...(call.resultTruncated ? [`调用 ${i + 1} · 记录带有截断标记`] : []),
  ]);
  // Receipt mappers expose explicit result status; no result text is read here.
  for (const receipt of receipts) {
    if (receipt !== record)
      warnings.push(`${receipt.capability === "WEBSEARCH" ? "网页搜索" : "链接读取"} · ${statuses[receipt.status]}`);
  }
  return { title: title?.text || (segments.some(s => s.segmentKey.startsWith("tool:")) ? "公开工具结果"
    : segments.some(s => s.segmentKey.startsWith("web:")) ? "网页搜索"
    : segments.some(s => s.segmentKey.startsWith("url:")) ? "链接读取" : "系统记录"),
    capability: record?.capability, status, statusText, callResult, primary, time, timeLabel, metadata, notices, warnings,
    details: rows.filter(row => row.key !== "display.title" && !notices.includes(row)), hasContent: segments.length > 0 };
}
