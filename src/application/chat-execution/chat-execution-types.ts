import type { JsonValue } from "@/domain/message";
import type { ApiRequestOptions } from "@/lib/api";

export type SendMessageInput = {
  readonly content: string;
  readonly contextLimit?: number;
  readonly attachments?: readonly string[];
  readonly whisperMode?: boolean;
  readonly fastMode?: boolean;
  readonly temperature?: number | null;
  readonly thinkingEffort?: string | null;
  readonly clientMessageId?: string | null;
};

export type RegenerateInput = {
  readonly contextLimit?: number;
  readonly whisperMode?: boolean;
  readonly fastMode?: boolean;
  readonly temperature?: number | null;
  readonly thinkingEffort?: string | null;
};

export type ChatExecutionRequestOptions = Omit<
  ApiRequestOptions,
  "body" | "method" | "query"
>;

export type SafeUsageSummary = {
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
};

export type ChatProviderFailureCode =
  | "provider_request_failed"
  | "provider_execution_failed";

/**
 * Events observed while reading one HTTP execution response.
 * They are temporary protocol facts, never persistent Message objects.
 */
export type ChatExecutionEvent =
  | {
      readonly type: "start";
      readonly assistantMessageId: string;
    }
  | {
      readonly type: "chunk";
      readonly content: string;
    }
  | {
      readonly type: "mcp-loading";
      readonly messageId: string;
      readonly tools: string;
    }
  | {
      readonly type: "heart-whisper";
      readonly id: string;
      readonly messageId: string;
      readonly content: string;
      readonly createdAt: number;
    }
  | {
      readonly type: "toy-command";
      readonly messageId: string;
      readonly commands: readonly string[];
    }
  | {
      readonly type: "camera-check";
      readonly conversationId: string;
      readonly modelKey: string;
      readonly messageId: string;
    }
  | {
      readonly type: "camera-offline";
    }
  | {
      readonly type: "poi-search";
      readonly conversationId: string;
      readonly categories: readonly string[];
      readonly messageId: string;
    }
  | {
      readonly type: "activity-check";
      readonly conversationId: string;
      readonly count: number;
      readonly messageId: string;
    }
  | {
      readonly type: "music";
      readonly messageId: string;
      readonly cards: readonly JsonValue[];
    }
  | {
      readonly type: "debug-summary";
      readonly messageId: string;
      readonly modelKey: string;
      readonly hasError: boolean;
      readonly failureCode: ChatProviderFailureCode | null;
      readonly usage: SafeUsageSummary | null;
    }
  | {
      readonly type: "unknown";
      readonly rawType: string;
    };

export type ChatExecutionStream = {
  readonly kind: "stream";
  readonly events: AsyncIterable<ChatExecutionEvent>;
};

export type DuplicateSendAcknowledgement = {
  readonly kind: "duplicate";
  readonly userMessageId: string;
};

export type SendExecutionResult =
  | ChatExecutionStream
  | DuplicateSendAcknowledgement;

export class ChatExecutionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatExecutionContractError";
  }
}
