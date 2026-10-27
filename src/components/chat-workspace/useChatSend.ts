import { useCallback, useEffect, useRef, useState } from "react";
import { readChatSendResult } from "@/application/chat-send/chat-send-result";

import {
  createChatSendController,
  INITIAL_CHAT_SEND_STATE,
  isChatExecutionActive,
  type ChatHistoryReconciler,
  type ChatRegenerateInput,
  type ChatSendController,
  type ChatSendInput,
  type ChatSendState,
} from "@/application/chat-send";

export type UseChatSendResult = {
  readonly getState: () => ChatSendState;
  readonly state: ChatSendState;
  readonly send: (input: ChatSendInput) => Promise<boolean>;
  readonly regenerate: (input: ChatRegenerateInput) => Promise<boolean>;
  readonly retryFinalization: () => Promise<void>;
  readonly resetError: () => void;
  readonly releaseAfterReview: () => void;
  readonly isExecutionActive: () => boolean;
};

// One Main Chat execution per app session. A view unmount is not a server stop.
// Keep only the controller in memory; no message text is written to browser storage.
let sessionController: ChatSendController | null = null;
let sessionReconciler: ChatHistoryReconciler | null = null;

export function pendingChatConversationId(): string | undefined {
  const state = sessionController?.getState();
  return state && isChatExecutionActive(state) && "conversationId" in state ? state.conversationId : undefined;
}

export function useChatSend(
  reconcileHistory: ChatHistoryReconciler,
): UseChatSendResult {
  const [state, setState] = useState<ChatSendState>(() => sessionController?.getState() ?? INITIAL_CHAT_SEND_STATE);
  const controllerRef = useRef<ChatSendController | null>(null);

  useEffect(() => {
    sessionReconciler = reconcileHistory;
    const controller = sessionController ??= createChatSendController({
      reconcileHistory: (...args) => {
        if (!sessionReconciler) return Promise.reject(new Error("Chat view is detached"));
        return sessionReconciler(...args);
      },
      lookupSendResult: readChatSendResult,
    });
    controllerRef.current = controller;
    setState(controller.getState());
    const unsubscribe = controller.subscribe(setState);

    return () => {
      unsubscribe();
      if (sessionReconciler === reconcileHistory) sessionReconciler = null;
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [reconcileHistory]);

  const send = useCallback(async (input: ChatSendInput) =>
    controllerRef.current?.send(input) ?? false, []);

  const regenerate = useCallback(async (input: ChatRegenerateInput) =>
    controllerRef.current?.regenerate(input) ?? false, []);

  const retryFinalization = useCallback(async () => {
    await controllerRef.current?.retryFinalization();
  }, []);

  const resetError = useCallback(() => {
    controllerRef.current?.resetError();
  }, []);

  const releaseAfterReview = useCallback(() => { controllerRef.current?.releaseAfterReview(); }, []);
  const isExecutionActive = useCallback(() => isChatExecutionActive(controllerRef.current?.getState() ?? INITIAL_CHAT_SEND_STATE), []);
  const getState = useCallback(() => controllerRef.current?.getState() ?? INITIAL_CHAT_SEND_STATE, []);
  return { state, send, regenerate, retryFinalization, resetError, releaseAfterReview, isExecutionActive, getState };
}
