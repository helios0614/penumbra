import {
  MESSAGE_HISTORY_LIMIT_MAX,
  MESSAGE_HISTORY_LIMIT_MIN,
  type Message,
} from "@/domain/message";

import {
  DEFAULT_MESSAGE_HISTORY_PAGE_SIZE,
  MessageHistoryContractError,
  type CreateMessageHistoryStateOptions,
  type MessageHistoryState,
  type MessagePageMergeContext,
  type OlderMessagePageMergeContext,
  type OlderPageStatus,
} from "@/application/message-history/message-history-types";

export function createMessageHistoryState(
  conversationId: string,
  messages: readonly Message[] = [],
  options: CreateMessageHistoryStateOptions = {},
): MessageHistoryState {
  assertMessageHistoryConversationId(conversationId);
  const pageSize = options.pageSize ?? DEFAULT_MESSAGE_HISTORY_PAGE_SIZE;
  assertMessageHistoryPageSize(pageSize);
  assertOlderPageStatus(options.olderPageStatus);
  assertMessagePage(messages, conversationId);

  const normalizedMessages = orderOldestToNewest(
    deduplicateIncomingPage(messages),
  );
  const oldestCursor = getOldestCursor(normalizedMessages);
  const olderPageStatus = oldestCursor === null
    ? "exhausted"
    : options.olderPageStatus ?? inferInitialOlderPageStatus(
      messages.length,
      pageSize,
    );

  return {
    conversationId,
    messages: normalizedMessages,
    pageSize,
    oldestCursor,
    olderPageStatus,
  };
}

export function mergeOlderMessagePage(
  state: MessageHistoryState,
  incomingPage: readonly Message[],
  context: OlderMessagePageMergeContext = {},
): MessageHistoryState {
  assertMessageHistoryState(state);
  const conversationId = context.conversationId ?? state.conversationId;
  assertMatchingConversation(state.conversationId, conversationId);
  assertMessagePage(incomingPage, conversationId);

  const requestedBefore = context.requestedBefore ?? state.oldestCursor;
  if (
    requestedBefore === null ||
    typeof requestedBefore !== "number" ||
    !Number.isFinite(requestedBefore)
  ) {
    throw contractError("Older message merge requires a valid timestamp cursor");
  }
  if (requestedBefore !== state.oldestCursor) {
    throw contractError("Older message merge cursor does not match history state");
  }

  if (incomingPage.length === 0) {
    return copyStateWithStatus(state, "exhausted");
  }

  const incomingMessages = deduplicateIncomingPage(incomingPage);
  const existingIds = new Set(state.messages.map((message) => message.id));
  const addedIdCount = incomingMessages.reduce(
    (count, message) => count + (existingIds.has(message.id) ? 0 : 1),
    0,
  );
  const incomingIds = new Set(incomingMessages.map((message) => message.id));
  const mergedMessages = orderOldestToNewest([
    ...incomingMessages,
    ...state.messages.filter((message) => !incomingIds.has(message.id)),
  ]);
  const oldestCursor = getOldestCursor(mergedMessages);

  let olderPageStatus: OlderPageStatus;
  if (
    addedIdCount === 0 ||
    oldestCursor === null ||
    oldestCursor >= requestedBefore
  ) {
    olderPageStatus = "stalled";
  } else if (incomingPage.length < state.pageSize) {
    olderPageStatus = "exhausted";
  } else {
    olderPageStatus = "maybe-more";
  }

  return {
    ...state,
    messages: mergedMessages,
    oldestCursor,
    olderPageStatus,
  };
}

export function mergeLatestMessagePage(
  state: MessageHistoryState,
  incomingPage: readonly Message[],
  context: MessagePageMergeContext = {},
): MessageHistoryState {
  assertMessageHistoryState(state);
  const conversationId = context.conversationId ?? state.conversationId;
  assertMatchingConversation(state.conversationId, conversationId);
  assertMessagePage(incomingPage, conversationId);

  const incomingMessages = deduplicateIncomingPage(incomingPage);
  const incomingById = new Map(
    incomingMessages.map((message) => [message.id, message] as const),
  );
  const retainedIds = new Set<string>();
  const mergedMessages = state.messages.map((message) => {
    const incoming = incomingById.get(message.id);
    if (incoming !== undefined) {
      retainedIds.add(message.id);
      return incoming;
    }
    return message;
  });

  for (const message of incomingMessages) {
    if (!retainedIds.has(message.id)) {
      retainedIds.add(message.id);
      mergedMessages.push(message);
    }
  }

  const orderedMessages = orderOldestToNewest(mergedMessages);
  return {
    ...state,
    messages: orderedMessages,
    oldestCursor: getOldestCursor(orderedMessages),
  };
}

export function assertMessageHistoryState(
  state: MessageHistoryState,
): void {
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    throw contractError("Message history state must be an object");
  }

  assertMessageHistoryConversationId(state.conversationId);
  assertMessageHistoryPageSize(state.pageSize);
  if (state.olderPageStatus === undefined) {
    throw contractError("Message history has an invalid older page status");
  }
  assertOlderPageStatus(state.olderPageStatus);
  assertMessagePage(state.messages, state.conversationId);

  const seenIds = new Set<string>();
  let previousCreatedAt = Number.NEGATIVE_INFINITY;
  for (const message of state.messages) {
    if (seenIds.has(message.id)) {
      throw contractError("Message history state contains a duplicate message ID");
    }
    seenIds.add(message.id);

    if (message.createdAt < previousCreatedAt) {
      throw contractError("Message history state is not ordered oldest to newest");
    }
    previousCreatedAt = message.createdAt;
  }

  const expectedCursor = getOldestCursor(state.messages);
  if (state.oldestCursor !== expectedCursor) {
    throw contractError("Message history cursor does not match loaded messages");
  }
}

export function assertMessageHistoryPageSize(pageSize: number): void {
  if (
    !Number.isInteger(pageSize) ||
    pageSize < MESSAGE_HISTORY_LIMIT_MIN ||
    pageSize > MESSAGE_HISTORY_LIMIT_MAX
  ) {
    throw contractError(
      "Message history page size must be an integer within the Message Domain limit",
    );
  }
}

export function assertMessageHistoryConversationId(
  conversationId: string,
): void {
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    throw contractError("Message history requires a conversation ID");
  }
}

export function copyStateWithStatus(
  state: MessageHistoryState,
  olderPageStatus: OlderPageStatus,
): MessageHistoryState {
  return {
    ...state,
    messages: [...state.messages],
    olderPageStatus,
  };
}

function inferInitialOlderPageStatus(
  responseItemCount: number,
  pageSize: number,
): OlderPageStatus {
  return responseItemCount < pageSize ? "exhausted" : "maybe-more";
}

/**
 * Incoming duplicate IDs use the payload at the last page occurrence. Keeping
 * only those last occurrences also gives the page a deterministic stable order.
 */
function deduplicateIncomingPage(messages: readonly Message[]): Message[] {
  const lastIndexById = new Map<string, number>();
  messages.forEach((message, index) => lastIndexById.set(message.id, index));
  return messages.filter(
    (message, index) => lastIndexById.get(message.id) === index,
  );
}

function orderOldestToNewest(messages: readonly Message[]): Message[] {
  return messages
    .map((message, insertionIndex) => ({ message, insertionIndex }))
    .sort((left, right) =>
      left.message.createdAt - right.message.createdAt ||
      left.insertionIndex - right.insertionIndex,
    )
    .map(({ message }) => message);
}

function getOldestCursor(messages: readonly Message[]): number | null {
  return messages.length === 0 ? null : messages[0]!.createdAt;
}

function assertMessagePage(
  messages: readonly Message[],
  conversationId: string,
): void {
  if (!Array.isArray(messages)) {
    throw contractError("Message history page must be an array");
  }

  for (const message of messages) {
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      throw contractError("Message history page contains an invalid message");
    }
    if (typeof message.id !== "string" || message.id.length === 0) {
      throw contractError("Message history page contains an invalid message ID");
    }
    if (message.conversationId !== conversationId) {
      throw contractError("Message history conversation does not match the request");
    }
    if (
      typeof message.createdAt !== "number" ||
      !Number.isFinite(message.createdAt)
    ) {
      throw contractError("Message history page contains an invalid timestamp");
    }
  }
}

function assertMatchingConversation(
  stateConversationId: string,
  requestConversationId: string,
): void {
  if (requestConversationId !== stateConversationId) {
    throw contractError("Message history conversation does not match the request");
  }
}

function assertOlderPageStatus(status: OlderPageStatus | undefined): void {
  if (
    status !== undefined &&
    status !== "maybe-more" &&
    status !== "exhausted" &&
    status !== "stalled"
  ) {
    throw contractError("Message history has an invalid older page status");
  }
}

function contractError(message: string): MessageHistoryContractError {
  return new MessageHistoryContractError(message);
}
