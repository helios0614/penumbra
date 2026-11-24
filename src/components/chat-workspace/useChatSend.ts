import { traceChat } from "@/lib/chat-timeline";
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
  readonly recordMessageDeletion: (conversationId: string, messageId: string) => void;
  readonly retryFinalization: (options?: { readonly manual?: boolean }) => Promise<void>;
  readonly reconcilePending: () => Promise<void>;
  readonly resetError: () => void;
  readonly cancel: () => Promise<void>;
  readonly isExecutionActive: (conversationId?: string) => boolean;
};
let selectedOwner: string | null = null;
let lastVisited: string | undefined;
let selectedReconciler: ChatHistoryReconciler | null = null;
const sessions = createChatExecutionSessions({
  observeVisibleHistory: true,
  lookupSendResult: readChatSendResult,
  reconcileHistory: async (owner, target) => {
    if (owner === selectedOwner && selectedReconciler) {
      try { return await selectedReconciler(owner, target); }
      catch { /* Detached reads can confirm persistence without applying visible history. */ }
    }
    return reconcileBackgroundChat(owner, target);
  },
});
export function pendingChatConversationId(): string | undefined { return lastVisited; }

async function reconcileSessions(conversationId?: string | null) {
  await Promise.all([
    sessions.reconcilePending(),
    conversationId ? sessions.get(conversationId).recoverStoppedResults(conversationId) : Promise.resolve(),
  ]);
  if (conversationId && !sessions.active(conversationId)) await sessions.get(conversationId).discoverActive(conversationId);
}

export function useChatSend(reconcileHistory: ChatHistoryReconciler, conversationId?: string | null, history?: readonly Message[]): UseChatSendResult {
  const owner = useRef(conversationId); owner.current = conversationId;
  const snapshot = useCallback(() => sessions.state(conversationId), [conversationId]);
  const state = useSyncExternalStore(sessions.subscribe, snapshot, snapshot);
  const executionId = "executionId" in state ? state.executionId : null;
  useEffect(() => {
    if (executionId && conversationId) traceChat("react.session", { executionId, conversationId }, { phase: state.kind });
  }, [state, executionId, conversationId]);
  useEffect(() => {
    if (conversationId && history) void sessions.reconcileUserPersistence(conversationId);
  }, [conversationId, history]);
  useEffect(() => {
    if (conversationId && history && state.recoveries) sessions.acceptVisibleHistory(conversationId, history);
  }, [conversationId, history, state.recoveries]);
  useEffect(() => {
    if (conversationId) {
      void sessions.get(conversationId).discoverActive(conversationId);
      void sessions.get(conversationId).recoverStoppedResults(conversationId);
    }
  }, [conversationId]);
  useEffect(() => {
    selectedOwner = conversationId ?? null;
    selectedReconciler = reconcileHistory;
    if (conversationId) lastVisited = conversationId;
    return () => { if (selectedReconciler === reconcileHistory) { selectedOwner = null; selectedReconciler = null; } };
  }, [conversationId, reconcileHistory]);
  useEffect(() => {
    const reconcile = () => { void reconcileSessions(owner.current); };
    window.addEventListener("online", reconcile);
    window.addEventListener("focus", reconcile);
    return () => { window.removeEventListener("online", reconcile); window.removeEventListener("focus", reconcile); };
  }, []);
  const getState = useCallback((id?: string) => sessions.state(id ?? owner.current), []);
  const send = useCallback((input: ChatSendInput) => sessions.get(input.conversationId).send(input), []);
  const regenerate = useCallback((input: ChatRegenerateInput) => sessions.get(input.conversationId).regenerate(input), []);
  const recordMessageDeletion = useCallback((id: string, messageId: string) => sessions.get(id).recordMessageDeletion(messageId), []);
  const retryFinalization = useCallback(async (options?: { readonly manual?: boolean }) => {
    const id = owner.current;
    if (id) await Promise.all([sessions.get(id).retryFinalization(options), sessions.get(id).recoverStoppedResults(id)]);
  }, []);
  const reconcilePending = useCallback(() => reconcileSessions(owner.current), []);
  const resetError = useCallback(() => { if (owner.current) sessions.get(owner.current).resetError(); }, []);
  const cancel = useCallback(async () => { if (owner.current) await sessions.get(owner.current).cancel(); }, []);
  const isExecutionActive = useCallback((id?: string) => { const current = id ?? owner.current; return !!current && sessions.active(current); }, []);
  return { state, getState, send, regenerate, recordMessageDeletion, retryFinalization, reconcilePending, resetError, cancel, isExecutionActive };
}
