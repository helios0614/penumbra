import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatWorkspaceLoadInput } from "@/application/chat-workspace";
import type { RealtimeEvent } from "@/application/realtime";
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
  readonly reloadSelectedConversationHistory: (
    conversationId: string,
  ) => Promise<readonly string[]>;
  readonly reconcileSelectedConversationRealtimeEvent: (
    event: RealtimeEvent,
  ) => Promise<void>;
  readonly reconcileSelectedConversationAfterReconnect: (
    conversationId: string,
  ) => Promise<void>;
  readonly refreshConversationList: () => Promise<void>;
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

  const reloadSelectedConversationHistory = useCallback(
    async (conversationId: string) => {
      const controller = controllerRef.current;
      if (controller === null) {
        throw new Error("Chat workspace controller is unavailable");
      }
      return controller.reloadSelectedConversationHistory(conversationId);
    },
    [],
  );

  const reconcileSelectedConversationRealtimeEvent = useCallback(
    async (event: RealtimeEvent) => {
      const controller = controllerRef.current;
      if (controller === null) {
        throw new Error("Chat workspace controller is unavailable");
      }
      await controller.reconcileSelectedConversationRealtimeEvent(event);
    },
    [],
  );

  const reconcileSelectedConversationAfterReconnect = useCallback(
    async (conversationId: string) => {
      const controller = controllerRef.current;
      if (controller === null) {
        throw new Error("Chat workspace controller is unavailable");
      }
      await controller.reconcileSelectedConversationAfterReconnect(
        conversationId,
      );
    },
    [],
  );

  const refreshConversationList = useCallback(async () => {
    const controller = controllerRef.current;
    if (controller === null) {
      throw new Error("Chat workspace controller is unavailable");
    }
    await controller.refreshConversationList();
  }, []);

  return {
    state,
    retry,
    selectConversation,
    retryConversationSwitch,
    reloadSelectedConversationHistory,
    reconcileSelectedConversationRealtimeEvent,
    reconcileSelectedConversationAfterReconnect,
    refreshConversationList,
  };
}
