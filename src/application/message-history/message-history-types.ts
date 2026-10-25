import type { Message } from "@/domain/message";
import type { ApiRequestOptions } from "@/lib/api";

export const DEFAULT_MESSAGE_HISTORY_PAGE_SIZE = 50;

export type OlderPageStatus =
  | "maybe-more"
  | "exhausted"
  | "stalled";

/** Only persisted messages that have been read back through HTTP history. */
export type MessageHistoryState = {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly pageSize: number;
  readonly oldestCursor: number | null;
  readonly olderPageStatus: OlderPageStatus;
  /** Production reads use opaque two-key boundaries. Timestamp remains for legacy fixtures/adapters only. */
  readonly window?: {
    readonly olderCursor: string | null;
    readonly newerCursor: string | null;
    readonly hasNewer: boolean;
    readonly reachesLatest: boolean;
  };
  readonly hasNewMessages?: boolean;
};

export type CreateMessageHistoryStateOptions = {
  readonly pageSize?: number;
  readonly olderPageStatus?: OlderPageStatus;
};

export type MessagePageMergeContext = {
  readonly conversationId?: string;
};

export type OlderMessagePageMergeContext = MessagePageMergeContext & {
  readonly requestedBefore?: number | null;
};

export type MessageHistoryRequestOptions = {
  readonly request?: ApiRequestOptions;
};

export type LoadInitialMessageHistoryOptions = MessageHistoryRequestOptions & {
  readonly pageSize?: number;
};

export type ReloadMessageHistoryOptions = LoadInitialMessageHistoryOptions;

export class MessageHistoryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageHistoryContractError";
  }
}
