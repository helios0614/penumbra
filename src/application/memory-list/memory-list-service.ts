import {
  listMemories,
  MemoryContractError,
  type MemoryListQuery,
  type MemoryPage,
} from "@/domain/memory";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

import {
  MEMORY_LIST_PAGE_SIZE,
  type MemoryDateFilter,
  type MemoryListRequest,
  type SafeMemoryListError,
} from "@/application/memory-list/memory-list-types";

export async function loadMemoryList(
  request: MemoryListRequest,
  options?: ApiRequestOptions,
  now: Date = new Date(),
): Promise<MemoryPage> {
  return listMemories(mapMemoryListRequest(request, now), options);
}

export function mapMemoryListRequest(
  request: MemoryListRequest,
  now: Date = new Date(),
): MemoryListQuery {
  const range = getMemoryDateRange(request.filters.date, now);
  return {
    page: request.page,
    pageSize: MEMORY_LIST_PAGE_SIZE,
    search: request.filters.search,
    importance: request.filters.importance,
    pinFirst: request.filters.pinFirst,
    ...range,
  };
}

export function getMemoryDateRange(
  filter: MemoryDateFilter,
  now: Date,
): Pick<MemoryListQuery, "createdFrom" | "createdTo"> {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new MemoryContractError("Invalid memory date filter clock");
  }
  if (filter === "all") return {};

  const days = filter === "today" ? 1 : filter === "7-days" ? 7 : filter === "30-days" ? 30 : null;
  if (days === null) {
    throw new MemoryContractError("Invalid memory date filter");
  }

  // AionHome's established memory-day boundary is 04:00 local time.
  const logicalDayStart = new Date(now);
  if (logicalDayStart.getHours() < 4) {
    logicalDayStart.setDate(logicalDayStart.getDate() - 1);
  }
  logicalDayStart.setHours(4, 0, 0, 0);
  const rangeStart = new Date(logicalDayStart);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));
  const rangeEnd = new Date(logicalDayStart);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  rangeEnd.setMilliseconds(-1);

  return {
    createdFrom: rangeStart.getTime() / 1_000,
    createdTo: rangeEnd.getTime() / 1_000,
  };
}

export function toSafeMemoryListError(error: unknown): SafeMemoryListError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { code: "authentication", message: "当前会话无法读取记忆库。" };
    }
    if (error.code === "TIMEOUT") {
      return { code: "timeout", message: "加载等待时间过长，请稍后重试。" };
    }
    if (error.code === "NETWORK_ERROR") {
      return { code: "network", message: "暂时无法连接到记忆库。" };
    }
  }
  if (error instanceof MemoryContractError) {
    return { code: "contract", message: "记忆数据暂时无法读取。" };
  }
  return { code: "unknown", message: "记忆库暂时无法加载。" };
}
