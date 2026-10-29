import { MemoryContractError } from "./memory-types";
import { MemoryBusinessError, type MemoryDigestResult, type MemoryEditInput, type MemoryRequeueTask, type MemorySourceCapability } from "./memory-management-types";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const id = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
function invalid(): never { throw new MemoryContractError("Invalid memory management response"); }

export function buildMemoryEditDto(input: MemoryEditInput) {
  if (!input.content.trim() || input.keywords !== undefined && typeof input.keywords !== "string" || input.importance !== undefined && (!Number.isFinite(input.importance) || input.importance < 0 || input.importance > 1)) invalid();
  return { content: input.content, ...(input.keywords !== undefined ? { keywords: input.keywords } : {}), ...(input.importance !== undefined ? { importance: input.importance } : {}) };
}
export function mapMemoryWrite(payload: unknown, requestedId?: string): void {
  if (!record(payload) || payload.ok !== true || requestedId !== undefined && payload.id !== requestedId) invalid();
}
export function mapMemoryResummary(payload: unknown, requestedId: string): void {
  if (!record(payload)) invalid();
  if (payload.ok === false) throw new MemoryBusinessError(payload.message === "记忆不存在" ? "memory_not_found" : "resummary_failed");
  mapMemoryWrite(payload, requestedId);
  if (typeof payload.content !== "string" || typeof payload.keywords !== "string" || typeof payload.importance !== "number" || !Number.isFinite(payload.importance) || ![0, 1].includes(payload.unresolved as number)) invalid();
}
export function mapMemorySource(payload: unknown): MemorySourceCapability {
  if (!record(payload)) invalid();
  if (payload.supported === true && count(payload.source_count) && payload.source_count > 0) return { supported: true, sourceCount: payload.source_count };
  if (payload.supported === false && id(payload.reason)) return { supported: false, reason: payload.reason };
  return invalid();
}
export function mapMemoryTask(payload: unknown, expected: { taskId?: string; memoryId?: string } = {}): MemoryRequeueTask {
  if (!record(payload) || payload.ok !== true || !id(payload.task_id) || !id(payload.deleted_memory_id) || !["pending", "completed"].includes(payload.state as string) || !count(payload.source_count) || payload.source_count < 1 || !(payload.result_memory_id === null || id(payload.result_memory_id)) || !(payload.last_error === null || id(payload.last_error)) || typeof payload.deduplicated !== "boolean") invalid();
  if (expected.taskId !== undefined && payload.task_id !== expected.taskId || expected.memoryId !== undefined && payload.deleted_memory_id !== expected.memoryId || payload.state === "completed" && !id(payload.result_memory_id)) invalid();
  return { id: payload.task_id as string, state: payload.state as MemoryRequeueTask["state"], deletedMemoryId: payload.deleted_memory_id as string, resultMemoryId: payload.result_memory_id as string | null, sourceCount: payload.source_count as number, lastError: payload.last_error as string | null, deduplicated: payload.deduplicated as boolean };
}
export function mapMemoryDigest(payload: unknown): MemoryDigestResult {
  if (!record(payload) || typeof payload.ok !== "boolean" || typeof payload.message !== "string" || !count(payload.new_memories_count) || !count(payload.processed_messages)) invalid();
  for (const key of ["pending_messages", "history_completed_tasks", "history_pending_tasks", "history_reused_memories"]) if (payload[key] !== undefined && !count(payload[key])) invalid();
  if (payload.outcome !== undefined && !id(payload.outcome)) invalid();
  return { ok: payload.ok as boolean, message: payload.message as string, newMemoriesCount: payload.new_memories_count as number, processedMessages: payload.processed_messages as number,
    ...(payload.pending_messages !== undefined ? { pendingMessages: payload.pending_messages as number } : {}),
    ...(payload.outcome !== undefined ? { outcome: payload.outcome as string } : {}),
    ...(payload.history_completed_tasks !== undefined ? { historyCompletedTasks: payload.history_completed_tasks as number } : {}),
    ...(payload.history_pending_tasks !== undefined ? { historyPendingTasks: payload.history_pending_tasks as number } : {}),
    ...(payload.history_reused_memories !== undefined ? { historyReusedMemories: payload.history_reused_memories as number } : {}) };
}
