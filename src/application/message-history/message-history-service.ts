import {
  listConversationMessages,
  type Message,
} from "@/domain/message";

import {
  assertMessageHistoryConversationId,
  assertMessageHistoryPageSize,
  assertMessageHistoryState,
  copyStateWithStatus,
  createMessageHistoryState,
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

export async function loadInitialMessageHistory(
  conversationId: string,
  options: LoadInitialMessageHistoryOptions = {},
): Promise<MessageHistoryState> {
  const pageSize = options.pageSize ?? DEFAULT_MESSAGE_HISTORY_PAGE_SIZE;
  assertMessageHistoryConversationId(conversationId);
  assertMessageHistoryPageSize(pageSize);

  const page = await listConversationMessages(
    conversationId,
    { limit: pageSize },
    options.request,
  );

  return createMessageHistoryState(conversationId, page, {
    pageSize,
    olderPageStatus: initialStatus(page, pageSize),
  });
}

export async function loadOlderMessageHistory(
  state: MessageHistoryState,
  options: MessageHistoryRequestOptions = {},
): Promise<MessageHistoryState> {
  assertMessageHistoryState(state);

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

function initialStatus(
  page: readonly Message[],
  pageSize: number,
): "maybe-more" | "exhausted" {
  return page.length < pageSize ? "exhausted" : "maybe-more";
}
