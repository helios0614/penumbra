import type { ChatExecutionRecovery, ChatSendState } from "@/application/chat-send";
import type { Message } from "@/domain/message";
import { mapMediaAttachments } from "@/domain/media/media-mappers";

import { presentChatMessages, type ChatMessageProjector } from "@/components/chat-workspace/presentation/chat-message-presenter";
import type { ChatMessageViewModel } from "@/components/chat-workspace/presentation/chat-presentation-types";

export function composeVisibleChatMessages(
  persistentMessages: readonly Message[],
  execution: ChatSendState,
  conversationId: string,
  projectMessages: ChatMessageProjector = presentChatMessages,
): readonly ChatMessageViewModel[] {
  let visible = [...projectMessages(persistentMessages)];
  // Only the current attempt may mask its target. A retained older execution
  // cannot hide authoritative rows belonging to a later execution's result.
  const current = "executionId" in execution ? execution : execution.recoveries?.find(
    recovery => recovery.executionId === execution.serverExecution?.executionId,
  );
  const regenerate = current && regenerateOverlay(current, conversationId);
  if (current && regenerate && !(current.serverExecution?.terminal && current.serverExecution.outcome === "cancelled") &&
      !(current.kind === "regenerate-finalization-uncertain" && current.recoveryReadSucceeded)) {
    // Transport/execution failure does not prove the canonical replacement
    // failed. Keep the cached target hidden until this history read succeeds.
    visible = visible.filter(message => message.id !== regenerate.targetMessageId);
  }
  const stoppedIds = new Set((execution.stoppedExecutions ?? [])
    .filter(item => item.execution.conversationId === conversationId).map(item => item.execution.executionId));
  for (const recovery of execution.recoveries ?? []) {
    if (stoppedIds.has(recovery.executionId)) continue;
    visible = [...composeExecutionMessages(persistentMessages, { ...recovery, checking: execution.checking }, conversationId, visible, true)];
  }
  if (!("executionId" in execution && stoppedIds.has(execution.executionId))) {
    visible = [...composeExecutionMessages(persistentMessages, execution, conversationId, visible)];
  }
  const renderedStops = new Set<string>();
  for (const { execution: result, createdAt } of execution.stoppedExecutions ?? []) {
    if (result.conversationId !== conversationId || !result.partialText.trim() || renderedStops.has(result.executionId)) continue;
    renderedStops.add(result.executionId);
    const row: ChatMessageViewModel = { kind: "assistant", id: `${result.executionId}:stopped`, content: result.partialText,
      createdAt, thinking: null, simpleThink: null, attachments: [], executionStatus: "stopped" };
    const anchor = result.kind === "send" ? result.userMessageId : result.targetMessageId;
    let index = visible.findIndex(message => message.id === anchor);
    if (index < 0) visible.push(row);
    else {
      while (visible[index + 1]?.executionStatus === "stopped") index++;
      visible.splice(index + 1, 0, row);
    }
  }
  return visible;
}

function composeExecutionMessages(
  persistentMessages: readonly Message[],
  execution: ChatSendState & Pick<ChatExecutionRecovery, "historyHandoff">,
  conversationId: string, visible: ChatMessageViewModel[], reviewed = false,
): readonly ChatMessageViewModel[] {
  // Once cancellation is durable, only its server-projected public body belongs
  // in the stopped row, independently of any history request still in flight.
  if (execution.serverExecution?.terminal && execution.serverExecution.outcome === "cancelled") return visible;
  if (execution.kind === "error" && execution.conversationId === conversationId && execution.assistant && !execution.optimisticUser && !execution.failedMessageId) {
    visible.push({ kind: "assistant", id: execution.assistant.overlayId, content: execution.assistant.content,
      createdAt: execution.assistant.createdAt, thinking: execution.assistant.thinking, simpleThink: execution.assistant.simpleThink,
      toolPending: execution.assistant.toolPending,
      error: execution.assistant.error ?? execution.error.message, attachments: [], executionStatus: "unconfirmed" });
    return visible;
  }
  if (execution.kind === "error" && execution.conversationId === conversationId && execution.failedMessageId) {
    const unchangedTarget = persistentMessages.some(message => message.id === execution.failedMessageId && message.content === execution.failedTargetContent);
    const result = visible.map(message => unchangedTarget && message.kind === "assistant" && message.id === execution.failedMessageId
      ? { ...message, error: execution.error.message } : message);
    const partial = execution.regeneratePartial;
    if (partial && (partial.content || partial.thinking || partial.simpleThink)) result.push({
      kind: "assistant", id: partial.overlayId, content: partial.content, createdAt: partial.createdAt,
      thinking: partial.thinking, simpleThink: partial.simpleThink, attachments: [], executionStatus: "unconfirmed",
    });
    return result;
  }
  const recovered = (execution.kind === "finalization-uncertain" || execution.kind === "regenerate-finalization-uncertain") && (execution.recoveryReadSucceeded || reviewed);
  const overlay = executionOverlay(execution, conversationId);
  const handoff = execution.historyHandoff;
  const serverSend = "executionId" in execution && execution.serverExecution?.kind === "send" &&
    execution.serverExecution.executionId === execution.executionId && execution.serverExecution.conversationId === conversationId
    ? execution.serverExecution : undefined;
  const userId = overlay?.optimisticUser.persistedMessageId ?? serverSend?.userMessageId;
  const persistedUser = userId != null && persistentMessages.some(message =>
    message.conversationId === conversationId && message.roleKind === "user" && message.id === userId);
  const assistantId = overlay?.assistant?.assistantMessageId;
  const persistedAssistant = assistantId != null && persistentMessages.some(message =>
    message.conversationId === conversationId && message.roleKind === "assistant" && message.id === assistantId);
  // A replaced streaming overlay without a bound user may be a stale attempt.
  if (persistedAssistant && !handoff && userId == null &&
      (execution.kind === "streaming" || execution.kind === "finalizing" || execution.kind === "finalization-uncertain")) return visible;
  // A successful execution can settle before the history containing its user.
  const awaitingUserHistory = serverSend?.terminal && serverSend.outcome === "completed" &&
    (execution.kind !== "finalization-uncertain" || !execution.recoveryReadSucceeded);
  if (overlay && !persistedUser && !handoff?.userApplied && !overlay.optimisticUser.deleted &&
      (handoff || awaitingUserHistory || (!recovered && !execution.serverExecution?.terminal))) {
    const assistantIndex = persistedAssistant ? visible.findIndex(message => message.id === assistantId) : -1;
    visible.splice(assistantIndex < 0 ? visible.length : assistantIndex, 0, {
      kind: "user",
      id: overlay.optimisticUser.overlayId,
      content: overlay.optimisticUser.content,
      createdAt: overlay.optimisticUser.createdAt,
      attachments: mapMediaAttachments(overlay.optimisticUser.attachments ?? [], "user"),
      executionStatus: overlay.status === "unconfirmed" ? "unconfirmed" : awaitingUserHistory ? "finalizing" : "optimistic",
    });
  }
  if (recovered && execution.conversationId === conversationId) {
    if (execution.kind === "regenerate-finalization-uncertain") {
      // The old target remains authoritative. Keep this attempt's partial in
      // a separate, explicitly temporary row until receipt + HTTP can agree.
      if (hasAssistantPresentation(execution.assistant)) visible.push({
        kind: "assistant", id: execution.assistant.overlayId,
        content: execution.assistant.content, createdAt: execution.assistant.createdAt,
        thinking: execution.assistant.thinking, simpleThink: execution.assistant.simpleThink,
        error: execution.assistant.error, attachments: [], executionStatus: execution.checking ? "finalizing" : "unconfirmed",
      });
      return visible;
    }
    if (persistedAssistant || handoff?.assistantApplied) return visible;
    const row: ChatMessageViewModel = { kind: "assistant", id: execution.assistant.overlayId,
      content: execution.assistant.content, createdAt: execution.assistant.createdAt,
      thinking: execution.assistant.thinking, simpleThink: execution.assistant.simpleThink,
      toolPending: execution.assistant.toolPending,
      error: execution.assistant.error ?? execution.executionError?.message,
      attachments: [], executionStatus: execution.checking ? "finalizing" : "unconfirmed" };
    const userIndex = handoff && persistedUser ? visible.findIndex(message => message.id === userId) : -1;
    visible.splice(userIndex < 0 ? visible.length : userIndex + 1, 0, row);
    return visible;
  }
  const regenerate = regenerateOverlay(execution, conversationId);
  if (regenerate !== null) {
    visible.push({
      kind: "assistant",
      id: regenerate.assistant.overlayId,
      content: regenerate.assistant.content,
      createdAt: regenerate.assistant.createdAt,
      thinking: regenerate.assistant.thinking,
      simpleThink: regenerate.assistant.simpleThink,
      toolPending: regenerate.assistant.toolPending,
      error: regenerate.assistant.error,
      attachments: [],
      executionStatus: regenerate.status,
    });
    return visible;
  }

  if (overlay === null) {
    return visible;
  }

  if (persistedUser && execution.kind === "sending-user") visible.push({
    kind: "assistant", id: `${execution.executionId}:assistant`, content: "",
    createdAt: overlay.optimisticUser.createdAt, thinking: null, simpleThink: null,
    attachments: [], executionStatus: "streaming",
  });

  if (!persistedAssistant && overlay.assistant !== null && (overlay.status !== "unconfirmed" || hasAssistantPresentation(overlay.assistant))) {
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
      : execution.kind === "finalizing" || execution.checking
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
      : execution.kind === "regenerate-finalizing" || execution.checking
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
