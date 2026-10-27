import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { readChatSendResult } from "@/application/chat-send/chat-send-result";
import { reconcileBackgroundChat } from "@/application/chat-send/chat-background-reconciliation";
import { createChatExecutionSessions } from "@/application/chat-send/chat-execution-sessions";
import { type ChatHistoryReconciler, type ChatRegenerateInput, type ChatSendInput, type ChatSendState } from "@/application/chat-send";
import type { Message } from "@/domain/message";

export type UseChatSendResult = {
  readonly getState: (conversationId?: string) => ChatSendState;
  readonly state: ChatSendState;
  readonly send: (input: ChatSendInput) => Promise<boolean>;
  readonly regenerate: (input: ChatRegenerateInput) => Promise<boolean>;
  readonly retryFinalization: () => Promise<void>;
  readonly reconcilePending: () => Promise<void>;
  readonly resetError: () => void;
  readonly releaseAfterReview: () => void;
  readonly isExecutionActive: (conversationId?: string) => boolean;
};
let selectedOwner: string | null = null;
let lastVisited: string | undefined;
let selectedReconciler: ChatHistoryReconciler | null = null;
const sessions = createChatExecutionSessions({
  lookupSendResult: readChatSendResult,
  reconcileHistory: async (owner, target) => {
    if (owner === selectedOwner && selectedReconciler) {
      try { return await selectedReconciler(owner, target); }
      catch { /* A switched/disposed Workspace cannot own this execution's read. */ }
    }
    return reconcileBackgroundChat(owner, target);
  },
});
export function pendingChatConversationId(): string | undefined { return lastVisited; }

export function useChatSend(reconcileHistory: ChatHistoryReconciler, conversationId?: string | null, history?: readonly Message[]): UseChatSendResult {
  const owner = useRef(conversationId); owner.current = conversationId;
  const snapshot = useCallback(() => sessions.state(conversationId), [conversationId]);
  const state = useSyncExternalStore(sessions.subscribe, snapshot, snapshot);
  const executionId = "executionId" in state ? state.executionId : null;
  useEffect(() => {
    if (conversationId && history) void sessions.reconcileUserPersistence(conversationId);
  }, [conversationId, history, executionId]);
  useEffect(() => {
    selectedOwner = conversationId ?? null;
    selectedReconciler = reconcileHistory;
    if (conversationId) lastVisited = conversationId;
    return () => { if (selectedReconciler === reconcileHistory) { selectedOwner = null; selectedReconciler = null; } };
  }, [conversationId, reconcileHistory]);
  useEffect(() => {
    const reconcile = () => { void sessions.reconcilePending(); };
    window.addEventListener("online", reconcile);
    window.addEventListener("focus", reconcile);
    return () => { window.removeEventListener("online", reconcile); window.removeEventListener("focus", reconcile); };
  }, []);
  const getState = useCallback((id?: string) => sessions.state(id ?? owner.current), []);
  const send = useCallback((input: ChatSendInput) => sessions.get(input.conversationId).send(input), []);
  const regenerate = useCallback((input: ChatRegenerateInput) => sessions.get(input.conversationId).regenerate(input), []);
  const retryFinalization = useCallback(async () => { if (owner.current) await sessions.get(owner.current).retryFinalization(); }, []);
  const reconcilePending = useCallback(() => sessions.reconcilePending(), []);
  const resetError = useCallback(() => { if (owner.current) sessions.get(owner.current).resetError(); }, []);
  const releaseAfterReview = useCallback(() => { if (owner.current) sessions.get(owner.current).releaseAfterReview(); }, []);
  const isExecutionActive = useCallback((id?: string) => { const current = id ?? owner.current; return !!current && sessions.active(current); }, []);
  return { state, getState, send, regenerate, retryFinalization, reconcilePending, resetError, releaseAfterReview, isExecutionActive };
}
