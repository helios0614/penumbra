export type MemoryEditInput = {
  readonly content: string;
  readonly keywords?: string;
  readonly importance?: number;
};
export type MemorySourceCapability =
  | { readonly supported: true; readonly sourceCount: number }
  | { readonly supported: false; readonly reason: string };
export type MemoryRequeueTask = {
  readonly id: string;
  readonly state: "pending" | "completed";
  readonly deletedMemoryId: string;
  readonly resultMemoryId: string | null;
  readonly sourceCount: number;
  readonly lastError: string | null;
  readonly deduplicated: boolean;
};
export type MemoryDigestResult = {
  readonly ok: boolean;
  readonly message: string;
  readonly newMemoriesCount: number;
  readonly processedMessages: number;
  readonly pendingMessages?: number;
  readonly outcome?: string;
  readonly historyCompletedTasks?: number;
  readonly historyPendingTasks?: number;
  readonly historyReusedMemories?: number;
};
export class MemoryBusinessError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MemoryBusinessError";
  }
}
