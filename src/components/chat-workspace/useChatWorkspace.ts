import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatWorkspaceLoadInput } from "@/application/chat-workspace";
import {
  createChatWorkspaceController,
  INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE,
  type ChatWorkspaceController,
  type ChatWorkspaceControllerState,
} from "@/components/chat-workspace/chat-workspace-controller";

export type UseChatWorkspaceResult = {
  readonly state: ChatWorkspaceControllerState;
  readonly retry: () => void;
  readonly selectConversation: (conversationId: string) => void;
  readonly retryConversationSwitch: () => void;
};

export function useChatWorkspace(
  input: ChatWorkspaceLoadInput = {},
): UseChatWorkspaceResult {
  const {
    preferredConversationId,
    currentConversationId,
    historyPageSize,
  } = input;
  const [state, setState] = useState<ChatWorkspaceControllerState>(
    INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE,
  );
  const controllerRef = useRef<ChatWorkspaceController | null>(null);

  useEffect(() => {
    const controller = createChatWorkspaceController({
      preferredConversationId,
      currentConversationId,
      historyPageSize,
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setState);
    void controller.load();

    return () => {
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [currentConversationId, historyPageSize, preferredConversationId]);

  const retry = useCallback(() => {
    void controllerRef.current?.retry();
  }, []);

  const selectConversation = useCallback((conversationId: string) => {
    void controllerRef.current?.selectConversation(conversationId);
  }, []);

  const retryConversationSwitch = useCallback(() => {
    void controllerRef.current?.retryConversationSwitch();
  }, []);

  return {
    state,
    retry,
    selectConversation,
    retryConversationSwitch,
  };
}
