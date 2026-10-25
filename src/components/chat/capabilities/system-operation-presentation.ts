import type { CapabilityField, CapabilityRecord } from "@/domain/message/capability-types";
import { statusLabel } from "./CapabilityDisclosure";
import { capabilityNotices } from "./capability-notice-presentation";

const rawLabels = new Set(["旧通知全文", "旧版系统原文", "原始记录"]);
const bodyLabels = new Set(["动态摘要", "动态结果", "位置结果", "位置状态", "地址", "查看说明"]);
const rangeLabels = new Set(["摘要覆盖区间", "覆盖时间", "查询区间", "查询时间范围"]);
const headerMetadataLabels = new Set(["重要度", "时间", "执行时间", "触发时间", "计划时间", "状态", "关键词", ...rangeLabels]);
const businessLabels = new Set(["内容", "记忆正文", "记忆正文（旧通知）", "查询", "域名", "来源", ...bodyLabels]);
const webTechnicalLabels = new Set(["候选数", "已读取数"]);
const legacyMemoryNotice = "从已保存的旧通知恢复；没有可靠记忆 ID，不提供跳转。";

function repeatsHeader(field: CapabilityField, title: string, summary?: string) {
  if (!headerMetadataLabels.has(field.label) || !field.text.trim()) return false;
  const forms = [field.text, `${field.label} ${field.text}`, `${field.label}：${field.text}`, `${field.label}: ${field.text}`];
  return [title, summary].some(text => text && (forms.includes(text) || text.split(" · ").some(part => forms.includes(part)))) ||
    (field.label === "重要度" && title.endsWith(`（重要度 ${field.text}）`));
}

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
  const hasBusinessContent = record.fields.some(field => businessLabels.has(field.label) && field.text.trim());
  for (const field of record.fields) {
    const repeatedRange = ranges.includes(field) && bodies.some(body => repeatsRange(body.text, field));
    // The header keeps ordinary metadata; observation ranges stay in the full
    // body/field while the summary is hidden on open. Never remove business prose.
    if (field === importance || repeatedRange || repeatsHeader(field, record.title, summaryRange ? undefined : summary) ||
      (field.label === "状态" && field.text === statusLabel[record.status])) continue;
    const technicalField = (hasBusinessContent && rawLabels.has(field.label)) ||
      (["WEBSEARCH", "URL_READ"].includes(record.capability) && webTechnicalLabels.has(field.label));
    (technicalField ? technical : primary).push(field);
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
    notices: capabilityNotices(record).map(notice => memory && notice === legacyMemoryNotice ? "旧记录未保存可靠记忆 ID。" : notice),
  };
}
