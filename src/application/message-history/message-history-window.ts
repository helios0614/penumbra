import type { MessageWindow } from "@/domain/message";
import { createMessageHistoryState } from "./message-history-state";
import {
  MessageHistoryContractError,
  type MessageHistoryState,
} from "./message-history-types";

export function historyFromWindow(
  page: MessageWindow,
  pageSize = 50,
): MessageHistoryState {
  return {
    ...createMessageHistoryState(page.conversationId, page.messages, {
      pageSize,
      olderPageStatus: page.hasOlder ? "maybe-more" : "exhausted",
    }),
    window: {
      olderCursor: page.olderCursor,
      newerCursor: page.newerCursor,
      hasNewer: page.hasNewer,
      reachesLatest: page.reachesLatest,
    },
  };
}
export function mergeAdjacentHistory(
  state: MessageHistoryState,
  page: MessageWindow,
  direction: "older" | "newer",
): MessageHistoryState {
  if (!state.window || page.conversationId !== state.conversationId)
    throw new MessageHistoryContractError("Window owner mismatch");
  const incomingIds = new Set(page.messages.map((m) => m.id));
  const retained = state.messages.filter((m) => !incomingIds.has(m.id));
  const messages =
    direction === "older"
      ? [...page.messages, ...retained]
      : [...retained, ...page.messages];
  return {
    ...state,
    messages,
    oldestCursor: messages[0]?.createdAt ?? null,
    olderPageStatus:
      direction === "older"
        ? page.hasOlder
          ? "maybe-more"
          : "exhausted"
        : state.olderPageStatus,
    window: {
      olderCursor:
        direction === "older" ? page.olderCursor : state.window.olderCursor,
      newerCursor:
        direction === "newer" ? page.newerCursor : state.window.newerCursor,
      hasNewer: direction === "newer" ? page.hasNewer : state.window.hasNewer,
      reachesLatest:
        direction === "newer" ? page.reachesLatest : state.window.reachesLatest,
    },
    hasNewMessages:
      direction === "newer" && page.reachesLatest
        ? false
        : state.hasNewMessages,
  };
}
/** Latest HTTP validation is authoritative for matching IDs, not for unobserved gaps. */
export function reconcileHistoryWindow(
  current: MessageHistoryState,
  incoming: MessageHistoryState,
  replaceWindow = true,
): MessageHistoryState {
  if (!current.window || !incoming.window) return incoming;
  const canonical = new Map(incoming.messages.map((m) => [m.id, m]));
  const overlap = current.messages.findIndex((m) => canonical.has(m.id));
  if (
    replaceWindow &&
    current.window.reachesLatest &&
    incoming.window.reachesLatest &&
    (overlap >= 0 || !current.messages.length)
  ) {
    const prefix = overlap < 0 ? [] : current.messages.slice(0, overlap);
    const messages = [...prefix, ...incoming.messages];
    return {
      ...incoming,
      messages,
      oldestCursor: messages[0]?.createdAt ?? null,
      olderPageStatus: prefix.length
        ? current.olderPageStatus
        : incoming.olderPageStatus,
      window: {
        ...incoming.window,
        olderCursor: prefix.length
          ? current.window.olderCursor
          : incoming.window.olderCursor,
      },
    };
  }
  const missingLatest =
    incoming.window.reachesLatest &&
    incoming.messages.some(
      (m) => !current.messages.some((known) => known.id === m.id),
    );
  return {
    ...current,
    messages: current.messages.map((m) => canonical.get(m.id) ?? m),
    hasNewMessages: current.hasNewMessages || missingLatest,
    window: missingLatest
      ? { ...current.window, reachesLatest: false, hasNewer: true }
      : current.window,
  };
}
