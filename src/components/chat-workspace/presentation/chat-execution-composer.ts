import type { ChatSendState } from "@/application/chat-send";
import type { Message } from "@/domain/message";

import { presentChatMessages } from "@/components/chat-workspace/presentation/chat-message-presenter";
import type { ChatMessageViewModel } from "@/components/chat-workspace/presentation/chat-presentation-types";

export function composeVisibleChatMessages(
  persistentMessages: readonly Message[],
  execution: ChatSendState,
  conversationId: string,
): readonly ChatMessageViewModel[] {
  const visible = [...presentChatMessages(persistentMessages)];
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
    attachments: [],
    executionStatus: overlay.status === "unconfirmed"
      ? "unconfirmed"
      : "optimistic",
  });

  if (overlay.assistant !== null && hasAssistantPresentation(overlay.assistant)) {
    visible.push({
      kind: "assistant",
      id: overlay.assistant.overlayId,
      content: overlay.assistant.content,
      createdAt: overlay.assistant.createdAt,
      thinking: overlay.assistant.thinking,
      simpleThink: overlay.assistant.simpleThink,
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
