import type {
  MemoryCreateDto,
  MemoryCreateResultDto,
  MemoryListDto,
  MemoryListItemDto,
} from "@/domain/memory/memory-dto";
import {
  MemoryContractError,
  type CreateMemoryInput,
  type Memory,
  type MemoryCreateResult,
  type MemoryPage,
  type MemoryUnresolvedMutationResult,
} from "@/domain/memory/memory-types";

const MAX_NORMALIZED_TAGS = 32;
const MAX_JS_DATE_SECONDS = 8_640_000_000_000;

export function mapMemoryList(payload: unknown): MemoryPage {
  const dto = parseMemoryList(payload);
  return {
    items: dto.items.map(toMemory),
    page: dto.page,
    pageSize: dto.page_size,
    total: dto.total,
    totalAll: dto.total_all,
    hasMore: dto.has_more,
  };
}

export function mapMemoryUnresolvedMutation(
  payload: unknown,
  requestedMemoryId: string,
): MemoryUnresolvedMutationResult {
  if (
    !isRecord(payload) ||
    payload.ok !== true ||
    payload.id !== requestedMemoryId ||
    (payload.unresolved !== 0 && payload.unresolved !== 1)
  ) {
    throw contractError("memory unresolved mutation");
  }

  return {
    ok: true,
    id: payload.id,
    unresolved: payload.unresolved,
  };
}

export function buildMemoryCreateDto(input: CreateMemoryInput): MemoryCreateDto {
  const content = input.content.trim();
  const type = input.type.trim();
  if (!content) throw new MemoryContractError("Invalid memory create content");
  if (!type) throw new MemoryContractError("Invalid memory create type");
  if (
    !Number.isFinite(input.importance) ||
    input.importance < 0 ||
    input.importance > 1
  ) {
    throw new MemoryContractError("Invalid memory create importance");
  }

  const keywords = normalizeCreateKeywords(input.keywords);
  return {
    content,
    type,
    importance: input.importance,
    keywords: keywords.length > 0 ? JSON.stringify(keywords) : "",
  };
}

export function mapMemoryCreateResult(payload: unknown): MemoryCreateResult {
  const dto = parseMemoryCreateResult(payload);
  return {
    id: dto.id,
    content: dto.content,
    type: dto.type,
    createdAt: dto.created_at,
    importance: dto.importance,
    keywords: dto.keywords,
  };
}

function parseMemoryList(payload: unknown): MemoryListDto {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.items) ||
    !isPositiveInteger(payload.page) ||
    !isPositiveInteger(payload.page_size) ||
    payload.page_size > 200 ||
    !isNonNegativeInteger(payload.total) ||
    !isNonNegativeInteger(payload.total_all) ||
    payload.total > payload.total_all ||
    typeof payload.has_more !== "boolean"
  ) {
    throw contractError("memory list");
  }

  return {
    items: payload.items.map(parseMemoryListItem),
    page: payload.page,
    page_size: payload.page_size,
    total: payload.total,
    total_all: payload.total_all,
    has_more: payload.has_more,
  };
}

function parseMemoryCreateResult(payload: unknown): MemoryCreateResultDto {
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    !payload.id ||
    typeof payload.content !== "string" ||
    typeof payload.type !== "string" ||
    !isValidTimestamp(payload.created_at) ||
    typeof payload.importance !== "number" ||
    !Number.isFinite(payload.importance) ||
    payload.importance < 0 ||
    payload.importance > 1 ||
    typeof payload.keywords !== "string"
  ) {
    throw contractError("memory create result");
  }

  return {
    id: payload.id,
    content: payload.content,
    type: payload.type,
    created_at: payload.created_at,
    importance: payload.importance,
    keywords: payload.keywords,
  };
}

function normalizeCreateKeywords(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values)) {
    throw new MemoryContractError("Invalid memory create keywords");
  }

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new MemoryContractError("Invalid memory create keywords");
    }
    const keyword = value.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }
  return keywords;
}

function parseMemoryListItem(payload: unknown): MemoryListItemDto {
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    !payload.id ||
    typeof payload.content !== "string" ||
    !isValidTimestamp(payload.created_at)
  ) {
    throw contractError("memory list item");
  }

  return {
    id: payload.id,
    content: payload.content,
    type: optionalString(payload.type),
    created_at: payload.created_at,
    source_conv: optionalString(payload.source_conv),
    keywords: parseKeywordsWireValue(payload.keywords),
    importance: optionalNumber(payload.importance),
    source_start_ts: optionalNumber(payload.source_start_ts),
    source_end_ts: optionalNumber(payload.source_end_ts),
    unresolved: parseUnresolvedWireValue(payload.unresolved),
  };
}

function toMemory(dto: MemoryListItemDto): Memory {
  return {
    id: dto.id,
    content: dto.content,
    type: normalizeOptionalText(dto.type),
    createdAt: dto.created_at,
    sourceConversationId: normalizeOptionalText(dto.source_conv),
    tags: normalizeTags(dto.keywords),
    ...(dto.keywords != null ? { keywordsForEdit: typeof dto.keywords === "string" ? dto.keywords : JSON.stringify(dto.keywords) } : {}),
    importance: normalizeImportance(dto.importance),
    sourceStartedAt: normalizeTimestamp(dto.source_start_ts),
    sourceEndedAt: normalizeTimestamp(dto.source_end_ts),
    isPinned: dto.unresolved === 1 || dto.unresolved === true,
  };
}

function normalizeTags(value: MemoryListItemDto["keywords"]): readonly string[] {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  let candidates: readonly unknown[];
  if (typeof value !== "string") {
    candidates = value;
  } else {
    try {
      const decoded: unknown = JSON.parse(value);
      candidates = Array.isArray(decoded) ? decoded : [value];
    } catch {
      candidates = [value];
    }
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const tag = candidate.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === MAX_NORMALIZED_TAGS) break;
  }
  return tags;
}

function normalizeImportance(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function normalizeTimestamp(value: number | null | undefined): number | null {
  return isValidTimestamp(value)
    ? value
    : null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function parseKeywordsWireValue(value: unknown): MemoryListItemDto["keywords"] {
  return typeof value === "string" || Array.isArray(value) ? value : null;
}

function parseUnresolvedWireValue(
  value: unknown,
): MemoryListItemDto["unresolved"] {
  return typeof value === "boolean" || value === 0 || value === 1 ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function contractError(contract: string): MemoryContractError {
  return new MemoryContractError(
    `Backend response does not match the ${contract} contract`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isValidTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_JS_DATE_SECONDS
  );
}
