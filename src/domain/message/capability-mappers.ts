import type { CapabilityField, CapabilityRecord, CapabilityStatus, MessageCapabilities, PublicToolCall } from "./capability-types";
import { mapWebReceipts } from "./web-receipt-mappers";
import { projectLegacyTools } from "./legacy-tool-projection";
import { projectLegacySystemText } from "./legacy-system-projection";

export const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const text = (value: unknown): string => typeof value === "string" ? value : "";
const statuses = new Set(["success", "failed", "partial", "skipped", "timeout", "cancelled", "unknown", "sent"]);
const status = (value: unknown): CapabilityStatus => statuses.has(text(value)) ? value as CapabilityStatus : "unknown";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
export function formatPublicValue(value: unknown): string {
  if (typeof value === "string") {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  return JSON.stringify(value, null, 2) ?? "";
}
export function deliveryNotice(value: unknown): string {
  return value === "not_included" ? "本批结果未注入 AI（上下文预算上限），已停止续写。"
    : value === "not_requested" ? "本次未发起模型续写。"
    : value === "response_received" ? "已收到使用本次结果的续写响应；这不代表 AI 已阅读超出上下文范围的保存内容。"
    : value === "prepared" ? "已准备本次 AI 上下文；是否送达模型尚无法确认。"
    : "历史记录未确认本次结果是否送达 AI。";
}

function toolCall(value: unknown): PublicToolCall {
  const dto = record(value), fields: CapabilityField[] = [], notices: string[] = [];
  const field = (label: string, v: unknown) => { if (v !== undefined && v !== null) fields.push({ label, text: formatPublicValue(v) }); };
  const args = record(dto.executed_args ?? dto.args);
  // Only explicit text-bearing fields. Never infer a remote business receipt
  // from the server/tool name or from the transport success boolean.
  for (const key of ["title", "content", "body", "text"]) {
    if (typeof args[key] === "string" && args[key] !== "[已隐藏]") field(key === "title" ? "调用标题" : "调用正文", args[key]);
  }
  field("调用参数", dto.args);
  if (dto.executed_args !== undefined && formatPublicValue(dto.executed_args) !== formatPublicValue(dto.args)) field("实际执行参数", dto.executed_args);
  let result: unknown = dto.result;
  if (typeof result === "string") { try { result = JSON.parse(result); } catch { /* Plain remote text already has its own result field. */ } }
  const content = record(result).content;
  if (Array.isArray(content)) {
    const blocks = content.flatMap(item => { const block = record(item); return block.type === "text" && typeof block.text === "string" ? [block.text] : []; });
    if (blocks.length) field("结果正文", blocks.join("\n\n"));
  }
  field("已保存结果", dto.result);
  if (typeof dto.original_length === "number" && Number.isFinite(dto.original_length)) field("结果长度（截断前）", `${dto.original_length} 字符`);
  if (dto.error && dto.error !== dto.result) field("错误信息", dto.error);
  if (dto.ai_result !== undefined && dto.ai_delivery !== "not_included") field("本次 AI 有界结果", dto.ai_result);
  if (dto.storage_truncated === true) notices.push("结果达到保存上限，完整原文不可恢复。");
  else if (dto.result_version == null && typeof dto.original_length === "number" && dto.original_length > text(dto.result).length) notices.push("旧记录仅保存了部分结果，完整原文不可恢复。");
  if (dto.args_truncated === true) notices.push("调用参数已按保存上限截断。");
  if (dto.executed_args_truncated === true) notices.push("实际执行参数已按保存上限截断。");
  if (dto.command_truncated === true) notices.push("原始命令已按保存上限截断。");
  if (dto.ai_truncated === true && dto.ai_delivery !== "not_included") notices.push("为本次 AI 准备的结果已按上下文预算截断。");
  notices.push(deliveryNotice(dto.ai_delivery));
  if (!dto.command_type) notices.push("状态表示调用层结果，业务是否完成以实际返回回执为准。");
  return { identifier: [text(dto.server), text(dto.tool)].filter(Boolean).join(":"),
    capability: text(dto.command_type) || "MCP", status: status(dto.status), fields, notices };
}

export function mapCapabilityRecord(value: unknown): CapabilityRecord | null {
  const dto = record(value);
  if (dto.version !== 1 || !["trigger", "operation", "result"].includes(text(dto.kind)) || !text(dto.title)) return null;
  const fields = Array.isArray(dto.fields) ? dto.fields.flatMap(value => {
    const f = record(value);
    return typeof f.label === "string" && typeof f.text === "string" ? [{ label: f.label, text: f.text }] : [];
  }) : [];
  const facts = record(dto.facts);
  const timestamp = (key: string, label: string) => {
    const v = facts[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) fields.push({ label, text: new Date(v * 1000).toLocaleString("zh-CN", { hour12: false }) });
  };
  timestamp("last_assistant_ts", "AI 上次回复");
  if (typeof facts.elapsed_seconds === "number" && Number.isFinite(facts.elapsed_seconds)) fields.push({ label: "AI 回复已间隔", text: `约 ${Math.max(0, Math.round(facts.elapsed_seconds / 60))} 分钟` });
  if (typeof facts.threshold_minutes === "number" && Number.isFinite(facts.threshold_minutes)) fields.push({ label: "触发阈值", text: `${facts.threshold_minutes} 分钟` });
  timestamp("last_user_ts", "用户上次回复");
  const notices = strings(dto.notices);
  if (dto.ai_delivery !== undefined) notices.push(deliveryNotice(dto.ai_delivery));
  return { kind: dto.kind as CapabilityRecord["kind"], title: text(dto.title), capability: text(dto.capability), status: status(dto.status), fields, notices,
    calls: Array.isArray(dto.calls) ? dto.calls.map(toolCall) : [],
    ...(typeof dto.summary === "string" ? { summary: dto.summary } : {}),
    ...(typeof dto.preview === "string" ? { preview: dto.preview } : {}),
    ...(dto.preview_lines === 2 ? { previewLines: 2 as const } : {}) };
}

export function mapMessageCapabilities(dto: Record<string, unknown>): MessageCapabilities {
  const reaction = record(dto.reaction);
  const validReaction = dto.role === "user" && reaction.type === "reaction" && reaction.conv_id === dto.conv_id && reaction.target_message_id === dto.id &&
    text(reaction.id) && text(reaction.emoji) && (reaction.source_message_id === null || typeof reaction.source_message_id === "string");
  const legacyCalls = projectLegacyTools(dto.mcp_tool_calls);
  const legacyTools = legacyCalls.length ? mapCapabilityRecord({ version: 1, kind: "result", capability: "tools", title: "工具执行", calls: legacyCalls }) : null;
  const publicDisplay = dto.role === "system" ? mapCapabilityRecord(dto.public_display) : null;
  const tools = dto.role === "assistant" ? mapCapabilityRecord(dto.public_tool_result) ?? legacyTools : null;
  const compatibility: CapabilityRecord = { kind: "operation", capability: "backend-compatibility", title: "系统通知", status: "unknown", fields: [], calls: [],
    notices: ["旧后端未返回可用的系统文本或执行结果；更新 AionHome 后可重新读取。"] };
  return {
    conversationId: text(dto.conv_id),
    display: dto.role === "system" ? publicDisplay ?? legacyTools ?? projectLegacySystemText(dto.content) ?? (dto.public_view_version === 1 ? null : compatibility) : null,
    results: [...mapWebReceipts(dto), ...(tools ? [{ ...tools, id: `${text(dto.id)}:tools` }] : [])],
    reaction: validReaction ? { id: text(reaction.id), emoji: text(reaction.emoji), targetMessageId: text(reaction.target_message_id), sourceMessageId: reaction.source_message_id as string | null } : null,
    hasHeart: dto.role === "assistant" && dto.has_heart === true,
    heartRevision: dto.role === "assistant" && typeof dto.heart_revision === "string" ? dto.heart_revision : null,
  };
}
