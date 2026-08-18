import type { MemoryUnresolvedUpdateDto } from "@/domain/memory/memory-dto";
import {
  mapMemoryList,
  mapMemoryUnresolvedMutation,
} from "@/domain/memory/memory-mappers";
import {
  MemoryContractError,
  type MemoryImportanceFilter,
  type MemoryListQuery,
  type MemoryPage,
  type MemoryUnresolvedMutationResult,
} from "@/domain/memory/memory-types";
import {
  apiGet,
  apiRequest,
  type ApiQuery,
  type ApiRequestOptions,
} from "@/lib/api";

export const MEMORIES_ENDPOINT = "/api/memories";

export async function listMemories(
  query: MemoryListQuery,
  options?: ApiRequestOptions,
): Promise<MemoryPage> {
  return mapMemoryList(
    await apiGet<unknown>(MEMORIES_ENDPOINT, {
      ...options,
      query: buildMemoryListApiQuery(query),
    }),
  );
}

export async function setMemoryUnresolved(
  memoryId: string,
  unresolved: boolean,
  options?: ApiRequestOptions,
): Promise<MemoryUnresolvedMutationResult> {
  const body: MemoryUnresolvedUpdateDto = { unresolved };
  return mapMemoryUnresolvedMutation(
    await apiRequest<unknown>(memoryUnresolvedPath(memoryId), {
      ...options,
      method: "PUT",
      body,
    }),
    memoryId,
  );
}

export function buildMemoryListApiQuery(query: MemoryListQuery): ApiQuery {
  if (!Number.isInteger(query.page) || query.page < 1) {
    throw queryError("page");
  }
  if (!Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 200) {
    throw queryError("page size");
  }

  const search = query.search?.trim();
  if (search && search.length > 200) {
    throw queryError("search");
  }
  if (query.createdFrom !== undefined && !isFiniteTimestamp(query.createdFrom)) {
    throw queryError("created-from");
  }
  if (query.createdTo !== undefined && !isFiniteTimestamp(query.createdTo)) {
    throw queryError("created-to");
  }
  if (
    query.createdFrom !== undefined &&
    query.createdTo !== undefined &&
    query.createdFrom > query.createdTo
  ) {
    throw queryError("date range");
  }

  const importance = normalizeImportanceFilter(query.importance);
  return {
    page: query.page,
    page_size: query.pageSize,
    q: search || undefined,
    created_from: query.createdFrom,
    created_to: query.createdTo,
    importance,
    pin_first: query.pinFirst ? true : undefined,
  };
}

function normalizeImportanceFilter(
  value: MemoryImportanceFilter | undefined,
): Exclude<MemoryImportanceFilter, "all"> | undefined {
  if (value === undefined || value === "all") return undefined;
  if (["low", "mid", "high", "top"].includes(value)) return value;
  throw queryError("importance");
}

function queryError(field: string): MemoryContractError {
  return new MemoryContractError(`Invalid memory list ${field} query`);
}

function isFiniteTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function memoryUnresolvedPath(memoryId: string): string {
  return `${MEMORIES_ENDPOINT}/${encodeURIComponent(memoryId)}/unresolved`;
}
