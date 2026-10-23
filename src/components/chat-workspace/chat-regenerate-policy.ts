import { isChatExecutionActive, type ChatSendState } from "@/application/chat-send";
import type { Message } from "@/domain/message";

import type { ChatWorkspaceControllerState } from "@/components/chat-workspace/chat-workspace-controller";

export type ChatRegenerateAvailability = {
  readonly target: Message | null;
  readonly enabled: boolean;
  readonly reason: string | null;
};

export function getChatRegenerateAvailability(
  workspaceState: ChatWorkspaceControllerState,
  executionState: ChatSendState,
): ChatRegenerateAvailability {
  const target = latestTailAssistant(workspaceState);
  if (target === null) {
    return unavailable(null, "当前没有可重新生成的最新回复。");
  }
  if (isChatExecutionActive(executionState)) {
    return unavailable(target, "当前已有消息正在执行。");
  }
  if (workspaceState.status !== "ready") {
    return unavailable(target, "会话工作区尚未就绪。");
  }
  if (workspaceState.pendingConversationId !== null) {
    return unavailable(target, "正在切换会话。");
  }
  if (workspaceState.configurationPending || executionState.kind === "error") return unavailable(target, "请先重新读取当前状态。");

  const selected = workspaceState.workspace.selectedConversation;
  const readiness = workspaceState.workspace.setup.readiness;
  if (selected === null || readiness.kind === "unavailable") {
    return unavailable(target, "当前无法确认重新生成服务状态。");
  }
  if (
    workspaceState.workspace.setup.conversationId !== selected.id ||
    readiness.value.modelKey !== workspaceState.workspace.setup.modelKey ||
    !readiness.value.ready ||
    readiness.value.reason !== "ready"
  ) {
    return unavailable(target, "当前回复暂时不能重新生成。");
  }

  return { target, enabled: true, reason: null };
}

export function isRegenerateTargetMessage(
  workspaceState: ChatWorkspaceControllerState,
  messageId: string,
): boolean {
  return latestTailAssistant(workspaceState)?.id === messageId;
}

function latestTailAssistant(
  workspaceState: ChatWorkspaceControllerState,
): Message | null {
  if (workspaceState.status !== "ready") return null;
  const { workspace } = workspaceState;
  const selectedId = workspace.selectedConversationId;
  const history = workspace.history;
  if (
    selectedId === null ||
    workspace.selectedConversation?.id !== selectedId ||
    history === null ||
    history.conversationId !== selectedId
  ) {
    return null;
  }

  for (let index = history.messages.length - 1; index >= 0; index -= 1) {
    const message = history.messages[index]!;
    if (message.conversationId !== selectedId) return null;
    if (
      message.isCarryover === true ||
      (message.roleKind !== "assistant" && message.roleKind !== "user")
    ) {
      continue;
    }
    return message.roleKind === "assistant" && message.isCarryover === false
      ? message
      : null;
  }
  return null;
}

function unavailable(
  target: Message | null,
  reason: string,
): ChatRegenerateAvailability {
  return { target, enabled: false, reason };
}
