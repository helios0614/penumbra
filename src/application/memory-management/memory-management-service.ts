import { MemoryBusinessError, MemoryContractError } from "@/domain/memory";
import { ApiError } from "@/lib/api";
import type { MemoryManagementError } from "./memory-management-types";
export const MEMORY_SOURCE_REASONS: Readonly<Record<string, string>> = {
  source_untracked: "这条记忆没有精确来源记录，无法安全重新总结来源。",
  source_missing: "部分原始消息已不存在，暂不能重新总结来源。",
  source_changed: "原始消息已发生变化，不能使用之前的来源记录。",
  source_not_historical: "来源包含尚未完成增量总结的消息，请先总结新记忆。",
  source_already_represented: "已有其他记忆记录了相同来源，本次不会删除或重复生成。",
  source_requeue_pending: "相同来源已有待处理任务，本次不会删除这条记忆。",
  source_representation_changed: "相同来源的记忆状态已变化，请重新查询。",
};
export function sourceReason(code: string) { return MEMORY_SOURCE_REASONS[code] ?? "当前来源不满足重新总结条件，请重新检查。"; }
export function taskFailure(code: string) {
  return MEMORY_SOURCE_REASONS[code] ?? ({ llm_failure: "辅助模型未能完成总结。", parse_failure: "总结结果无法读取。", embedding_failure: "记忆向量生成失败。", persistence_failure: "总结结果未能保存。" }[code] ?? "这次来源总结未能完成。");
}
export function memoryManagementError(error: unknown): MemoryManagementError {
  if (error instanceof MemoryBusinessError) return { code: error.code, uncertain: false, message: error.code === "operation_busy" ? "请等待当前操作完成。" : error.code === "memory_not_found" ? "这条记忆已不存在，请重新读取列表。" : "重新总结未完成，原有显示已保留，请核对列表后重试。" };
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return { code: "authentication", uncertain: false, message: "当前会话无法管理记忆，请检查登录状态。" };
    const detail = (error.data as { detail?: { code?: unknown } } | null)?.detail;
    const code = typeof detail?.code === "string" ? detail.code : "";
    if (MEMORY_SOURCE_REASONS[code]) return { code, uncertain: false, message: sourceReason(code) };
    if (error.status === 409) return { code: code || "conflict", uncertain: false, message: "来源或记忆状态已变化，请重新检查后再操作。" };
    if (error.status === 404) return { code: "not-found", uncertain: false, message: "记忆或任务可能已不存在，请重新读取核对。" };
    if (error.status === 422) return { code: "validation", uncertain: false, message: "填写内容未能通过校验，请检查后重试。" };
    return { code: code || error.code, uncertain: true, message: "操作结果暂时无法确认。请先重新读取列表或查询任务；不要重复提交总结请求。" };
  }
  return { code: error instanceof MemoryContractError ? "contract" : "unknown", uncertain: true, message: "操作结果暂时无法确认，当前输入已保留，请先重新读取列表核对。" };
}
