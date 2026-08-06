import {
  refreshLatestMessageHistory,
  reloadMessageHistoryFromScratch,
  type MessageHistoryState,
} from "@/application/message-history";
import type { RealtimeEvent } from "@/application/realtime";

import {
  assertReconciliationId,
  planRealtimeReconnect,
  planRealtimeReconciliation,
} from "@/application/realtime-reconciliation/realtime-reconciliation-plan";
import {
  assertReconciliationStateInput,
  removeMessageFromHistory,
} from "@/application/realtime-reconciliation/realtime-reconciliation-state";
import type {
  RealtimeReconciliationAuthority,
  RealtimeReconciliationOptions,
  RealtimeReconciliationPlan,
  RealtimeReconciliationResult,
} from "@/application/realtime-reconciliation/realtime-reconciliation-types";

/**
 * Applies exactly one already-mapped realtime event. A future coordinator must
 * serialize calls per conversation and ensure stale requests cannot overwrite
 * newer refreshes; file sync and reconnect reloads supersede queued refreshes.
 */
export async function reconcileRealtimeEvent(
  state: MessageHistoryState,
  event: RealtimeEvent,
  options: RealtimeReconciliationOptions = {},
): Promise<RealtimeReconciliationResult> {
  assertReconciliationStateInput(state);
  return executePlan(state, planRealtimeReconciliation(event), options);
}

/** Rebuilds the current latest HTTP window after a caller-managed reconnect. */
export async function reconcileMessageHistoryAfterReconnect(
  state: MessageHistoryState,
  options: RealtimeReconciliationOptions = {},
): Promise<RealtimeReconciliationResult> {
  assertReconciliationStateInput(state);
  return executePlan(
    state,
    planRealtimeReconnect(state.conversationId),
    options,
  );
}

/**
 * True means only that WS announced persistence for the SSE generation ID.
 * It neither creates a Message nor proves that the execution or refresh ended.
 */
export function isPersistedAssistantNotification(
  event: RealtimeEvent,
  assistantMessageId: string,
  conversationId: string,
): boolean {
  assertReconciliationId(assistantMessageId);
  assertReconciliationId(conversationId);

  if (event.type !== "message-created") {
    return false;
  }

  assertReconciliationId(event.messageId);
  assertReconciliationId(event.conversationId);
  return event.messageId === assistantMessageId &&
    event.conversationId === conversationId;
}

async function executePlan(
  state: MessageHistoryState,
  plan: RealtimeReconciliationPlan,
  options: RealtimeReconciliationOptions,
): Promise<RealtimeReconciliationResult> {
  switch (plan.kind) {
    case "refresh-latest-history": {
      if (plan.conversationId !== state.conversationId) {
        return unchangedResult(state, plan, "other-conversation");
      }

      const refresh = options.dependencies?.refreshLatestMessageHistory ??
        refreshLatestMessageHistory;
      const nextState = await refresh(state, options.history);
      return changedResult(
        state,
        nextState,
        plan,
        "refreshed-latest",
        plan.authority === "latest-window-only"
          ? "latest-window-only"
          : "authoritative",
      );
    }
    case "remove-message": {
      if (plan.conversationId !== state.conversationId) {
        return unchangedResult(state, plan, "other-conversation");
      }

      const nextState = removeMessageFromHistory(
        state,
        plan.conversationId,
        plan.messageId,
      );
      return changedResult(
        state,
        nextState,
        plan,
        nextState === state ? "no-history-change" : "removed-message",
        "authoritative",
      );
    }
    case "reload-history": {
      if (plan.conversationId !== state.conversationId) {
        return unchangedResult(state, plan, "other-conversation");
      }

      const reload = options.dependencies?.reloadMessageHistoryFromScratch ??
        reloadMessageHistoryFromScratch;
      const nextState = await reload(state, options.history);
      return changedResult(
        state,
        nextState,
        plan,
        "reloaded-history",
        "authoritative",
      );
    }
    case "invalidate-conversation-list":
      return {
        ...unchangedResult(state, plan, "not-applicable"),
        conversationInvalidated: true,
      };
    case "ignore":
      return unchangedResult(state, plan, "not-applicable");
  }
}

function changedResult(
  previousState: MessageHistoryState,
  state: MessageHistoryState,
  plan: RealtimeReconciliationPlan,
  applied: RealtimeReconciliationResult["applied"],
  authority: RealtimeReconciliationAuthority,
): RealtimeReconciliationResult {
  return {
    state,
    plan,
    applied,
    historyChanged: state !== previousState,
    authority,
    scope: "current-conversation",
    conversationInvalidated: false,
  };
}

function unchangedResult(
  state: MessageHistoryState,
  plan: RealtimeReconciliationPlan,
  scope: "other-conversation" | "not-applicable",
): RealtimeReconciliationResult {
  return {
    state,
    plan,
    applied: "no-history-change",
    historyChanged: false,
    authority: "not-applicable",
    scope,
    conversationInvalidated: false,
  };
}
