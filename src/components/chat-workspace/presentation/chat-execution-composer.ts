import type { ChatSendState } from "@/application/chat-send";
import type { Message } from "@/domain/message";
import { mapMediaAttachments } from "@/domain/media/media-mappers";

import { presentChatMessages } from "@/components/chat-workspace/presentation/chat-message-presenter";
import type { ChatMessageViewModel } from "@/components/chat-workspace/presentation/chat-presentation-types";

export function composeVisibleChatMessages(
  persistentMessages: readonly Message[],
  execution: ChatSendState,
  conversationId: string,
): readonly ChatMessageViewModel[] {
  const visible = [...presentChatMessages(persistentMessages)];
  if (execution.kind === "error" && execution.conversationId === conversationId && execution.assistant && !execution.optimisticUser && !execution.failedMessageId) {
    visible.push({ kind: "assistant", id: execution.assistant.overlayId, content: execution.assistant.content,
      createdAt: execution.assistant.createdAt, thinking: execution.assistant.thinking, simpleThink: execution.assistant.simpleThink,
      toolPending: execution.assistant.toolPending,
      error: execution.assistant.error ?? execution.error.message, attachments: [], executionStatus: "unconfirmed" });
    return visible;
  }
  if (execution.kind === "error" && execution.conversationId === conversationId && execution.failedMessageId) {
    const unchangedTarget = persistentMessages.some(message => message.id === execution.failedMessageId && message.content === execution.failedTargetContent);
    return visible.map(message => unchangedTarget && message.kind === "assistant" && message.id === execution.failedMessageId
      ? { ...message, error: execution.error.message } : message);
  }
  if ((execution.kind === "streaming" || execution.kind === "finalizing" || execution.kind === "finalization-uncertain") &&
      execution.conversationId === conversationId && visible.some(message => message.id === execution.assistant.assistantMessageId)) return visible;
  const recovered = (execution.kind === "finalization-uncertain" || execution.kind === "regenerate-finalization-uncertain") && execution.recoveryReadSucceeded;
  if (recovered && execution.conversationId === conversationId) {
    if (execution.kind === "regenerate-finalization-uncertain") return visible;
    if (visible.some(message => message.id === execution.assistant.assistantMessageId)) return visible;
    // HTTP authority replaces optimistic rows. Uncommitted SSE text/error may
    // still be shown explicitly as temporary, never as a saved Message.
    visible.push({ kind: "assistant", id: execution.assistant.overlayId,
      content: execution.assistant.content, createdAt: execution.assistant.createdAt,
      thinking: execution.assistant.thinking, simpleThink: execution.assistant.simpleThink,
      toolPending: execution.assistant.toolPending,
      error: execution.assistant.error ?? execution.executionError?.message,
      attachments: [], executionStatus: "unconfirmed" });
    return visible;
  }
  const regenerate = regenerateOverlay(execution, conversationId);
  if (regenerate !== null) {
    const targetIndex = visible.findIndex(({ id }) =>
      id === regenerate.targetMessageId
    );
    if (targetIndex < 0) return visible;
    visible[targetIndex] = {
      kind: "assistant",
      id: regenerate.targetMessageId,
      content: regenerate.assistant.content,
      createdAt: regenerate.assistant.createdAt,
      thinking: regenerate.assistant.thinking,
      simpleThink: regenerate.assistant.simpleThink,
      toolPending: regenerate.assistant.toolPending,
      error: regenerate.assistant.error,
      attachments: [],
      executionStatus: regenerate.status,
    };
    return visible;
  }

  const overlay = executionOverlay(execution, conversationId);
  if (overlay === null) {
    return visible;
  }

  visible.push({
    kind: "user",
    id: overlay.optimisticUser.overlayId,
    content: overlay.optimisticUser.content,
    createdAt: overlay.optimisticUser.createdAt,
    attachments: mapMediaAttachments(overlay.optimisticUser.attachments ?? [], "user"),
    executionStatus: overlay.status === "unconfirmed"
      ? "unconfirmed"
      : "optimistic",
  });

  if (overlay.assistant !== null && (overlay.status !== "unconfirmed" || hasAssistantPresentation(overlay.assistant))) {
    visible.push({
      kind: "assistant",
      id: overlay.assistant.overlayId,
      content: overlay.assistant.content,
      createdAt: overlay.assistant.createdAt,
      thinking: overlay.assistant.thinking,
      simpleThink: overlay.assistant.simpleThink,
      toolPending: overlay.assistant.toolPending,
      error: overlay.assistant.error ?? (execution.kind === "finalization-uncertain" ? execution.executionError?.message : undefined),
      attachments: [],
      executionStatus: overlay.status,
    });
  }

  return visible;
}

function executionOverlay(
  execution: ChatSendState,
  conversationId: string,
) {
  if (execution.kind === "idle") return null;
  if (
    execution.kind === "regenerate-streaming" ||
    execution.kind === "regenerate-finalizing" ||
    execution.kind === "regenerate-finalization-uncertain"
  ) {
    return null;
  }
  if (execution.kind === "error") {
    if (
      execution.conversationId !== conversationId ||
      execution.optimisticUser === undefined
    ) {
      return null;
    }
    return {
      optimisticUser: execution.optimisticUser,
      assistant: execution.assistant ?? null,
      status: "unconfirmed" as const,
    };
  }
  if (execution.conversationId !== conversationId) return null;
  if (execution.kind === "sending-user") {
    return {
      optimisticUser: execution.optimisticUser,
      assistant: null,
      status: "optimistic" as const,
    };
  }
  return {
    optimisticUser: execution.optimisticUser,
    assistant: execution.assistant,
    status: execution.kind === "streaming"
      ? "streaming" as const
      : execution.kind === "finalizing"
        ? "finalizing" as const
        : "unconfirmed" as const,
  };
}

function regenerateOverlay(
  execution: ChatSendState,
  conversationId: string,
) {
  if (
    execution.kind !== "regenerate-streaming" &&
    execution.kind !== "regenerate-finalizing" &&
    execution.kind !== "regenerate-finalization-uncertain"
  ) {
    return null;
  }
  if (execution.conversationId !== conversationId) return null;

  return {
    targetMessageId: execution.targetMessageId,
    assistant: execution.assistant,
    status: execution.kind === "regenerate-streaming"
      ? "streaming" as const
      : execution.kind === "regenerate-finalizing"
        ? "finalizing" as const
        : "unconfirmed" as const,
  };
}

function hasAssistantPresentation(
  assistant: NonNullable<ReturnType<typeof executionOverlay>>["assistant"],
): boolean {
  return assistant !== null && (
    assistant.assistantMessageId !== null ||
    assistant.content.length > 0 ||
    assistant.thinking !== null ||
    assistant.simpleThink !== null
  );
}
