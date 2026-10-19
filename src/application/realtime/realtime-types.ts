import type { WebSocketConnection } from "@/lib/websocket";

export type RealtimeEvent =
  | { readonly type: "schedule-changed" }
  | { readonly type: "schedule-alarm"; readonly id: string; readonly content: string; readonly triggerAt: string }
  | { readonly type: "monitor-alert"; readonly content: string }
  | { readonly type: "location-updated"; readonly reportedAt: number | null }
  | {
      readonly type: "activity-log";
      readonly timestamp: number;
      readonly device: string;
    }
  | {
      readonly type: "activity-config-changed";
      readonly enabled: boolean;
    }
  | {
      readonly type: "message-created";
      readonly messageId: string;
      readonly conversationId: string;
    }
  | {
      readonly type: "message-updated";
      readonly messageId: string;
      readonly conversationId: string;
    }
  | {
      readonly type: "message-deleted";
      readonly messageId: string;
      readonly conversationId: string;
    }
  | {
      readonly type: "conversation-created";
      readonly conversationId: string;
    }
  | {
      readonly type: "conversation-updated";
      readonly conversationId: string;
    }
  | {
      readonly type: "conversation-deleted";
      readonly conversationId: string;
    }
  | {
      readonly type: "file-synced";
      readonly conversationId: string;
    }
  | {
      readonly type: "unknown";
      readonly rawType: string;
    };

export type RealtimeConnection = WebSocketConnection<RealtimeEvent>;

export type OpenRealtimeEventsOptions = {
  readonly signal?: AbortSignal;
  readonly openTimeoutMs?: number;
};

export class RealtimeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeDataError";
  }
}

export class RealtimeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeContractError";
  }
}
