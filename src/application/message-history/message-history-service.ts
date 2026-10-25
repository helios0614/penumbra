import {
  listConversationMessages,
  readMessageWindow,
} from "@/domain/message";

import {
  assertMessageHistoryConversationId,
  assertMessageHistoryPageSize,
  assertMessageHistoryState,
  copyStateWithStatus,
  mergeLatestMessagePage,
  mergeOlderMessagePage,
} from "@/application/message-history/message-history-state";
import {
  DEFAULT_MESSAGE_HISTORY_PAGE_SIZE,
  type LoadInitialMessageHistoryOptions,
  type MessageHistoryRequestOptions,
  type MessageHistoryState,
  type ReloadMessageHistoryOptions,
} from "@/application/message-history/message-history-types";
import { historyFromWindow, mergeAdjacentHistory, reconcileHistoryWindow } from "./message-history-window";

export async function loadInitialMessageHistory(
  conversationId: string,
  options: LoadInitialMessageHistoryOptions = {},
): Promise<MessageHistoryState> {
  const pageSize = options.pageSize ?? DEFAULT_MESSAGE_HISTORY_PAGE_SIZE;
  assertMessageHistoryConversationId(conversationId);
  assertMessageHistoryPageSize(pageSize);

  return historyFromWindow(await readMessageWindow(conversationId, { limit: pageSize }, options.request), pageSize);
}

export async function loadOlderMessageHistory(
  state: MessageHistoryState,
  options: MessageHistoryRequestOptions = {},
): Promise<MessageHistoryState> {
  assertMessageHistoryState(state);
  if (state.window) {
    if (!state.window.olderCursor) return state;
    return mergeAdjacentHistory(state, await readMessageWindow(state.conversationId, { limit: state.pageSize, beforeCursor: state.window.olderCursor }, options.request), "older");
  }

  if (
    state.olderPageStatus === "exhausted" ||
    state.olderPageStatus === "stalled"
  ) {
    return state;
  }

  if (state.oldestCursor === null) {
    return copyStateWithStatus(state, "exhausted");
  }

  const requestedBefore = state.oldestCursor;
  const page = await listConversationMessages(
    state.conversationId,
    {
      limit: state.pageSize,
      before: requestedBefore,
      beforeId: state.messages[0]?.id,
    },
    options.request,
  );

  return mergeOlderMessagePage(state, page, {
    conversationId: state.conversationId,
    requestedBefore,
  });
}

export async function refreshLatestMessageHistory(
  state: MessageHistoryState,
  options: MessageHistoryRequestOptions = {},
): Promise<MessageHistoryState> {
  assertMessageHistoryState(state);
  if (state.window) return reconcileHistoryWindow(state, await loadInitialMessageHistory(state.conversationId, { pageSize: state.pageSize, request: options.request }));

  const page = await listConversationMessages(
    state.conversationId,
    { limit: state.pageSize },
    options.request,
  );

  return mergeLatestMessagePage(state, page, {
    conversationId: state.conversationId,
  });
}

export async function reloadMessageHistoryFromScratch(
  stateOrConversationId: MessageHistoryState | string,
  options: ReloadMessageHistoryOptions = {},
): Promise<MessageHistoryState> {
  if (typeof stateOrConversationId === "string") {
    return loadInitialMessageHistory(stateOrConversationId, options);
  }

  assertMessageHistoryState(stateOrConversationId);
  return loadInitialMessageHistory(stateOrConversationId.conversationId, {
    ...options,
    pageSize: options.pageSize ?? stateOrConversationId.pageSize,
  });
}

export async function loadMessageHistoryAround(conversationId: string, anchorId: string, options: LoadInitialMessageHistoryOptions = {}) {
  return historyFromWindow(await readMessageWindow(conversationId, { anchorId }, options.request), options.pageSize);
}
export async function loadNewerMessageHistory(state: MessageHistoryState, options: MessageHistoryRequestOptions = {}) {
  if (!state.window?.hasNewer) return state;
  // A fresh tail notification can invalidate a former null upper cursor. Resolve by reliable loaded ID.
  if (!state.window.newerCursor) {
    const anchor = state.messages[state.messages.length-1];
    if (!anchor) return loadInitialMessageHistory(state.conversationId, { pageSize: state.pageSize, request: options.request });
    return mergeAdjacentHistory(state, await readMessageWindow(state.conversationId, { anchorId: anchor.id, beforeLimit: 0, afterLimit: 50 }, options.request), "newer");
  }
  return mergeAdjacentHistory(state, await readMessageWindow(state.conversationId, { limit: state.pageSize, afterCursor: state.window.newerCursor }, options.request), "newer");
}
