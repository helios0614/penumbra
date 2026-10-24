import { useEffect, useRef, useState } from "react";

import {
  createChatRealtimeCoordinator,
  INITIAL_CHAT_REALTIME_STATE,
  type ChatRealtimeContext,
  type ChatRealtimeCoordinator,
  type ChatRealtimeState,
} from "@/application/chat-realtime";
import type { ChatSendState } from "@/application/chat-send";
import type { RealtimeEvent } from "@/application/realtime";
import type { ChatWorkspaceControllerState } from "@/components/chat-workspace/chat-workspace-controller";

export type UseChatRealtimeActions = {
  readonly reconcileEvent: (event: RealtimeEvent) => Promise<void>;
  readonly reconcileAfterReconnect: (
    conversationId: string,
  ) => Promise<void>;
  readonly refreshConversationList: () => Promise<void>;
};

export function useChatRealtime(
  workspaceState: ChatWorkspaceControllerState,
  sendState: ChatSendState,
  actions: UseChatRealtimeActions,
): ChatRealtimeState {
  const context = toRealtimeContext(workspaceState, sendState);
  const contextRef = useRef(context);
  contextRef.current = context;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const coordinatorRef = useRef<ChatRealtimeCoordinator | null>(null);
  if (coordinatorRef.current === null) {
    coordinatorRef.current = createChatRealtimeCoordinator({
      getContext: () => contextRef.current,
      reconcileEvent: (event) => actionsRef.current.reconcileEvent(event),
      reconcileAfterReconnect: (conversationId) =>
        actionsRef.current.reconcileAfterReconnect(conversationId),
      refreshConversationList: () =>
        actionsRef.current.refreshConversationList(),
    });
  }
  const coordinator = coordinatorRef.current;
  const [state, setState] = useState<ChatRealtimeState>(
    INITIAL_CHAT_REALTIME_STATE,
  );

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(setState);
    coordinator.start();
    return () => {
      unsubscribe();
      coordinator.stop();
    };
  }, [coordinator]);

  useEffect(() => {
    coordinator.contextChanged();
  }, [
    context.authenticated,
    context.selectedConversationId,
    context.workspaceAvailable,
    coordinator,
    sendState,
    workspaceState.status === "ready" ? workspaceState.pendingConversationId : null,
    workspaceState.status === "ready" ? workspaceState.configurationPending : false,
    workspaceState.status === "ready" ? workspaceState.conversationMutation : undefined,
  ]);

  return state;
}

export function toRealtimeContext(
  workspaceState: ChatWorkspaceControllerState,
  sendState: ChatSendState,
): ChatRealtimeContext {
  const workspaceAvailable = workspaceState.status === "ready";
  const selectedConversationId = workspaceAvailable
    ? workspaceState.workspace.selectedConversationId
    : null;

  return {
    workspaceAvailable,
    // A ready Workspace is the result of authenticated protected HTTP reads.
    authenticated: workspaceAvailable,
    selectedConversationId,
    execution: toExecutionContext(sendState),
  };
}

function toExecutionContext(
  state: ChatSendState,
): ChatRealtimeContext["execution"] {
  switch (state.kind) {
    case "sending-user":
      return {
        kind: "active",
        executionKind: "send",
        conversationId: state.conversationId,
        userMessageId: state.optimisticUser.clientMessageId,
        assistantMessageId: null,
        targetMessageId: null,
      };
    case "streaming":
    case "finalizing":
    case "finalization-uncertain":
      return {
        kind: "active",
        executionKind: "send",
        conversationId: state.conversationId,
        userMessageId: state.optimisticUser.clientMessageId,
        assistantMessageId: state.assistant.assistantMessageId,
        targetMessageId: null,
        ...(state.kind === "finalization-uncertain" ? { recovering: true } : {}),
      };
    case "regenerate-streaming":
    case "regenerate-finalizing":
    case "regenerate-finalization-uncertain":
      return {
        kind: "active",
        executionKind: "regenerate",
        conversationId: state.conversationId,
        userMessageId: null,
        assistantMessageId: state.assistant.assistantMessageId,
        targetMessageId: state.targetMessageId,
        ...(state.kind === "regenerate-finalization-uncertain" ? { recovering: true } : {}),
      };
    case "idle":
    case "error":
      return { kind: "idle" };
  }
}
