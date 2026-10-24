import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatWorkspaceLoadInput } from "@/application/chat-workspace";
import type { ChatHistoryReconciliationResult } from "@/application/chat-send";
import type { RealtimeEvent } from "@/application/realtime";
import type { MainSelection } from "@/domain/runtime";
import {
  createChatWorkspaceController,
  INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE,
  type ChatWorkspaceController,
  type ChatWorkspaceControllerState,
} from "@/components/chat-workspace/chat-workspace-controller";

export type UseChatWorkspaceResult = {
  readonly getState: () => ChatWorkspaceControllerState;
  readonly state: ChatWorkspaceControllerState;
  readonly retry: () => void;
  readonly selectConversation: (conversationId: string) => void;
  readonly retryConversationSwitch: () => void;
  readonly reloadSelectedConversationHistory: (
    conversationId: string,
    regenerateTargetMessageId?: string,
  ) => Promise<ChatHistoryReconciliationResult>;
  readonly reconcileSelectedConversationRealtimeEvent: (
    event: RealtimeEvent,
  ) => Promise<void>;
  readonly reconcileSelectedConversationAfterReconnect: (
    conversationId: string,
  ) => Promise<void>;
  readonly refreshConversationList: () => Promise<void>;
  readonly saveMainSelection: (conversationId: string, selection: MainSelection) => Promise<void>;
  readonly createConversation: () => Promise<void>;
  readonly renameConversation: (id: string, title: string) => Promise<void>;
  readonly deleteConversation: (id: string) => Promise<void>;
  readonly loadOlderHistory: () => Promise<void>;
};

export function useChatWorkspace(
  input: ChatWorkspaceLoadInput = {},
  canNavigate?: () => boolean,
): UseChatWorkspaceResult {
  const navigationGuard = useRef(canNavigate);
  navigationGuard.current = canNavigate;
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
    }, { canNavigate: () => navigationGuard.current?.() !== false });
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
    async (
      conversationId: string,
      regenerateTargetMessageId?: string,
    ) => {
      const controller = controllerRef.current;
      if (controller === null) {
        throw new Error("Chat workspace controller is unavailable");
      }
      return controller.reloadSelectedConversationHistory(
        conversationId,
        regenerateTargetMessageId,
      );
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
  const saveMainSelection = useCallback(async (conversationId: string, selection: MainSelection) => {
    const controller = controllerRef.current;
    if (!controller) throw new Error("Workspace unavailable");
    await controller.saveMainSelection(conversationId, selection);
  }, []);
  const createConversation = useCallback(async () => { await controllerRef.current?.createConversation(); }, []);
  const renameConversation = useCallback(async (id: string, title: string) => { await controllerRef.current?.renameConversation(id, title); }, []);
  const deleteConversation = useCallback(async (id: string) => { await controllerRef.current?.deleteConversation(id); }, []);
  const loadOlderHistory = useCallback(async () => { await controllerRef.current?.loadOlderHistory(); }, []);
  const getState = useCallback(() => controllerRef.current?.getState() ?? INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE, []);

  return {
    getState,
    state,
    retry,
    selectConversation,
    retryConversationSwitch,
    reloadSelectedConversationHistory,
    reconcileSelectedConversationRealtimeEvent,
    reconcileSelectedConversationAfterReconnect,
    refreshConversationList,
    saveMainSelection,
    createConversation,
    renameConversation,
    deleteConversation,
    loadOlderHistory,
  };
}
