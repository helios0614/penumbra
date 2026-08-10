import { useCallback, useEffect, useRef, useState } from "react";

import {
  createChatSendController,
  INITIAL_CHAT_SEND_STATE,
  type ChatHistoryReconciler,
  type ChatRegenerateInput,
  type ChatSendController,
  type ChatSendInput,
  type ChatSendState,
} from "@/application/chat-send";

export type UseChatSendResult = {
  readonly state: ChatSendState;
  readonly send: (input: ChatSendInput) => Promise<boolean>;
  readonly regenerate: (input: ChatRegenerateInput) => Promise<boolean>;
  readonly retryFinalization: () => void;
  readonly resetError: () => void;
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

  const retryFinalization = useCallback(() => {
    void controllerRef.current?.retryFinalization();
  }, []);

  const resetError = useCallback(() => {
    controllerRef.current?.resetError();
  }, []);

  return { state, send, regenerate, retryFinalization, resetError };
}
