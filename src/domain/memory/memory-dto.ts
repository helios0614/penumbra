export type MemoryListItemDto = {
  id: string;
  content: string;
  type?: string | null;
  created_at: number;
  source_conv?: string | null;
  keywords?: string | readonly unknown[] | null;
  importance?: number | null;
  source_start_ts?: number | null;
  source_end_ts?: number | null;
  unresolved?: number | boolean | null;
};

export type MemoryListDto = {
  items: MemoryListItemDto[];
  page: number;
  page_size: number;
  total: number;
  total_all: number;
  has_more: boolean;
};

export type MemoryUnresolvedUpdateDto = {
  unresolved: boolean;
};

export type MemoryCreateDto = {
  content: string;
  type: string;
  importance: number;
  keywords: string;
};

export type MemoryCreateResultDto = {
  id: string;
  content: string;
  type: string;
  created_at: number;
  importance: number;
  keywords: string;
};
