import { apiGet, apiRequest, type ApiRequestOptions } from "@/lib/api";
import { MEMORIES_ENDPOINT } from "./memory-client";
import { buildMemoryEditDto, mapMemoryDigest, mapMemoryResummary, mapMemorySource, mapMemoryTask, mapMemoryWrite } from "./memory-management-mappers";
import type { MemoryEditInput } from "./memory-management-types";

export const MEMORY_SUMMARY_TIMEOUT_MS = 600_000;
const path = (id: string) => `${MEMORIES_ENDPOINT}/${encodeURIComponent(id)}`;
export async function editMemory(id: string, input: MemoryEditInput, options?: ApiRequestOptions) {
  mapMemoryWrite(await apiRequest<unknown>(path(id), { timeoutMs: 60_000, ...options, method: "PUT", body: buildMemoryEditDto(input) }), id);
}
export async function deleteMemory(id: string, options?: ApiRequestOptions) {
  mapMemoryWrite(await apiRequest<unknown>(path(id), { ...options, method: "DELETE" }));
}
export async function resummarizeMemory(id: string, options?: ApiRequestOptions) {
  mapMemoryResummary(await apiRequest<unknown>(`${path(id)}/re_summarize`, { timeoutMs: MEMORY_SUMMARY_TIMEOUT_MS, ...options, method: "POST" }), id);
}
export async function digestMemories(options?: ApiRequestOptions) {
  return mapMemoryDigest(await apiRequest<unknown>(`${MEMORIES_ENDPOINT}/digest`, { timeoutMs: MEMORY_SUMMARY_TIMEOUT_MS, ...options, method: "POST" }));
}
export async function checkMemorySource(id: string, options?: ApiRequestOptions) {
  return mapMemorySource(await apiGet<unknown>(`${path(id)}/requeue-source`, options));
}
export async function deleteAndRequeueMemory(id: string, options?: ApiRequestOptions) {
  return mapMemoryTask(await apiRequest<unknown>(`${path(id)}/delete-and-requeue`, { ...options, method: "POST" }), { memoryId: id });
}
export async function readMemoryTask(id: string, options?: ApiRequestOptions) {
  return mapMemoryTask(await apiGet<unknown>(`${MEMORIES_ENDPOINT}/requeue/tasks/${encodeURIComponent(id)}`, options), { taskId: id });
}
