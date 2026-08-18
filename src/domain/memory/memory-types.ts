export type Memory = {
  readonly id: string;
  readonly content: string;
  readonly type: string | null;
  readonly createdAt: number;
  readonly sourceConversationId: string | null;
  readonly tags: readonly string[];
  readonly importance: number | null;
  readonly sourceStartedAt: number | null;
  readonly sourceEndedAt: number | null;
  readonly isPinned: boolean;
};

export type MemoryPage = {
  readonly items: readonly Memory[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalAll: number;
  readonly hasMore: boolean;
};

export type MemoryUnresolvedMutationResult = {
  readonly ok: true;
  readonly id: string;
  readonly unresolved: 0 | 1;
};

export type MemoryImportanceFilter = "all" | "low" | "mid" | "high" | "top";

export type MemoryListQuery = {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly createdFrom?: number;
  readonly createdTo?: number;
  readonly importance?: MemoryImportanceFilter;
  readonly pinFirst?: boolean;
};

export class MemoryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryContractError";
  }
}
