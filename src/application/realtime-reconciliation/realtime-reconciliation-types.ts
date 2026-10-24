import type {
  MessageHistoryRequestOptions,
  MessageHistoryState,
} from "@/application/message-history";

export type RealtimeReconciliationPlan =
  | { readonly kind: "refresh-capability-anchor"; readonly messageId: string; readonly conversationId: string | null }
  | {
      readonly kind: "refresh-latest-history";
      readonly conversationId: string;
      readonly reason: "message-created" | "message-updated";
      readonly authority:
        | "expected-authoritative"
        | "latest-window-only";
    }
  | {
      readonly kind: "remove-message";
      readonly conversationId: string;
      readonly messageId: string;
    }
  | {
      readonly kind: "reload-history";
      readonly conversationId: string;
      readonly reason: "file-synced" | "reconnect";
    }
  | {
      readonly kind: "invalidate-conversation-list";
      readonly conversationId: string;
      readonly reason:
        | "conversation-created"
        | "conversation-updated"
        | "conversation-deleted";
    }
  | {
      readonly kind: "ignore";
      readonly rawType: string;
    };

export type RealtimeReconciliationApplied =
  | "refreshed-latest"
  | "removed-message"
  | "reloaded-history"
  | "no-history-change";

export type RealtimeReconciliationAuthority =
  | "authoritative"
  | "latest-window-only"
  | "not-applicable";

export type RealtimeReconciliationScope =
  | "current-conversation"
  | "other-conversation"
  | "not-applicable";

export type RealtimeReconciliationResult = {
  readonly state: MessageHistoryState;
  readonly plan: RealtimeReconciliationPlan;
  readonly applied: RealtimeReconciliationApplied;
  readonly historyChanged: boolean;
  readonly authority: RealtimeReconciliationAuthority;
  readonly scope: RealtimeReconciliationScope;
  readonly conversationInvalidated: boolean;
};

export type RealtimeReconciliationDependencies = {
  readonly refreshLatestMessageHistory: (
    state: MessageHistoryState,
    options?: MessageHistoryRequestOptions,
  ) => Promise<MessageHistoryState>;
  readonly reloadMessageHistoryFromScratch: (
    state: MessageHistoryState,
    options?: MessageHistoryRequestOptions,
  ) => Promise<MessageHistoryState>;
};

export type RealtimeReconciliationOptions = {
  readonly history?: MessageHistoryRequestOptions;
  readonly dependencies?: Partial<RealtimeReconciliationDependencies>;
};

export class RealtimeReconciliationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeReconciliationContractError";
  }
}
