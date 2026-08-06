import type { MessageHistoryState } from "@/application/message-history";

import { assertReconciliationId } from "@/application/realtime-reconciliation/realtime-reconciliation-plan";
import { RealtimeReconciliationContractError } from "@/application/realtime-reconciliation/realtime-reconciliation-types";

export function removeMessageFromHistory(
  state: MessageHistoryState,
  conversationId: string,
  messageId: string,
): MessageHistoryState {
  assertStateInput(state);
  assertReconciliationId(conversationId);
  assertReconciliationId(messageId);

  if (state.conversationId !== conversationId) {
    throw new RealtimeReconciliationContractError(
      "Realtime reconciliation conversation does not match history state",
    );
  }

  const messageIndex = state.messages.findIndex(
    (message) => message.id === messageId,
  );
  if (messageIndex === -1) {
    return state;
  }

  const messages = state.messages.filter((_, index) => index !== messageIndex);
  return {
    ...state,
    messages,
    oldestCursor: messages.length === 0 ? null : messages[0]!.createdAt,
  };
}

export function assertReconciliationStateInput(
  state: MessageHistoryState,
): void {
  assertStateInput(state);
}

function assertStateInput(
  state: MessageHistoryState,
): asserts state is MessageHistoryState {
  if (
    typeof state !== "object" ||
    state === null ||
    Array.isArray(state) ||
    !Array.isArray(state.messages)
  ) {
    throw new RealtimeReconciliationContractError(
      "Realtime reconciliation requires message history state",
    );
  }
  assertReconciliationId(state.conversationId);
}
