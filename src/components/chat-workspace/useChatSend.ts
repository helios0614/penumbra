import { useCallback, useEffect, useRef, useState } from "react";

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

export function useChatSend(
  reconcileHistory: ChatHistoryReconciler,
): UseChatSendResult {
  const [state, setState] = useState<ChatSendState>(INITIAL_CHAT_SEND_STATE);
  const controllerRef = useRef<ChatSendController | null>(null);

  useEffect(() => {
    const controller = createChatSendController({ reconcileHistory });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setState);

    return () => {
      unsubscribe();
      controller.dispose();
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
