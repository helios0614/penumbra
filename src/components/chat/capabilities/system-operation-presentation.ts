import type { CapabilityField, CapabilityRecord } from "@/domain/message/capability-types";

const rawLabels = new Set(["旧通知全文", "旧版系统原文", "原始记录"]);
const bodyLabels = new Set(["动态摘要", "动态结果", "位置结果", "位置状态", "地址", "查看说明"]);
const rangeLabels = new Set(["摘要覆盖区间", "覆盖时间", "查询区间", "查询时间范围"]);
const legacyMemoryNotice = "从已保存的旧通知恢复；没有可靠记忆 ID，不提供跳转。";

// Compare complete display lines, including the existing formatter's exact
// annotation. A shared substring of two different intervals is not equality.
function repeatsRange(text: string, field: CapabilityField) {
  const lines = [field.text, `覆盖 ${field.text}`, `${field.label}：${field.text}`, `${field.label}: ${field.text}`,
    ...(field.label === "摘要覆盖区间" ? [`摘要覆盖区间：${field.text}（服务端本地时间，不含当前未结束窗口）`] : [])];
  return text.split(/\r?\n/).some(line => lines.includes(line));
}

/** Arrange producer-authored facts only. Never parse old prose or infer status. */
export function systemOperationPresentation(record: CapabilityRecord) {
  const primary: CapabilityField[] = [], technical: CapabilityField[] = [];
  const memory = record.capability === "MEMORY_WRITE";
  const observation = ["ACTIVITY_CHECK", "Location", "CAM_CHECK"].includes(record.capability);
  const bodies = observation ? record.fields.filter(field => bodyLabels.has(field.label) && field.text.trim()) : [];
  const importance = memory ? record.fields.find(field => field.label === "重要度" && field.text.trim()) : undefined;
  const importanceSummary = importance ? `重要度 ${importance.text}` : undefined;
  const importanceInTitle = !!importanceSummary && (record.title.endsWith(importanceSummary) || record.title.endsWith(`（${importanceSummary}）`));
  const importanceInSummary = record.summary === importanceSummary || (!!importanceSummary && !!record.summary?.endsWith(` · ${importanceSummary}`));
  const summary = importanceSummary && !importanceInTitle && !importanceInSummary
    ? [record.summary, importanceSummary].filter(Boolean).join(" · ") : record.summary;
  const ranges = observation ? record.fields.filter(field => rangeLabels.has(field.label) && field.text.trim()) : [];
  const summaryRange = ranges.find(field => summary === `覆盖 ${field.text}` || summary === field.text);
  for (const field of record.fields) {
    const repeatedImportance = field === importance;
    const repeatedRange = ranges.includes(field) && bodies.some(body => repeatsRange(body.text, field));
    (repeatedImportance || repeatedRange || (bodies.length > 0 && rawLabels.has(field.label)) ? technical : primary).push(field);
  }
  const memoryBody = memory ? record.fields.find(field => field.label === "记忆正文" || field.label === "记忆正文（旧通知）") : undefined;
  const readingBodies = memoryBody ? [memoryBody] : bodies;
  primary.sort((first, second) => Number(readingBodies.includes(second)) - Number(readingBodies.includes(first)));
  const preview = memoryBody?.text ?? record.preview ?? record.fields[0]?.text;
  return {
    // If the folded preview already carries the exact range, don't repeat it in the header.
    summary: summaryRange && preview && repeatsRange(preview, summaryRange) ? undefined : summary,
    hideSummaryWhenOpen: !!summaryRange,
    preview, previewLines: memory ? 2 as const : record.previewLines,
    primary, technical,
    notices: memory ? record.notices.map(notice => notice === legacyMemoryNotice ? "旧记录未保存可靠记忆 ID。" : notice) : record.notices,
  };
}
