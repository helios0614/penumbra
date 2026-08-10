import type { ChatSendState } from "@/application/chat-send";
import type { ChatSetupStatus } from "@/application/chat-setup";
import type { ChatWorkspaceControllerState } from "@/components/chat-workspace/chat-workspace-controller";

export type ChatSenderAvailability = {
  readonly enabled: boolean;
  readonly placeholder: string;
  readonly statusMessage: string | null;
};

export function getChatSenderAvailability(
  workspaceState: ChatWorkspaceControllerState,
  sendState: ChatSendState,
): ChatSenderAvailability {
  if (sendState.kind === "sending-user") {
    return unavailable("正在发送消息。");
  }
  if (sendState.kind === "streaming") {
    return unavailable(
      sendState.executionError?.message ?? "正在生成回复。",
    );
  }
  if (sendState.kind === "finalizing") {
    return unavailable("正在通过历史记录确认保存状态。");
  }
  if (sendState.kind === "finalization-uncertain") {
    return unavailable(sendState.error.message);
  }
  if (sendState.kind === "regenerate-streaming") {
    return unavailable(
      sendState.executionError?.message ?? "正在重新生成回复。",
    );
  }
  if (sendState.kind === "regenerate-finalizing") {
    return unavailable("正在通过历史记录确认重新生成结果。");
  }
  if (sendState.kind === "regenerate-finalization-uncertain") {
    return unavailable(sendState.error.message);
  }
  if (sendState.kind === "error") {
    return unavailable(sendState.error.message);
  }

  if (workspaceState.status !== "ready") {
    return unavailable("会话工作区尚未就绪。");
  }
  if (workspaceState.pendingConversationId !== null) {
    return unavailable("正在切换会话。");
  }

  const { workspace } = workspaceState;
  const selected = workspace.selectedConversation;
  if (selected === null || workspace.history === null) {
    return unavailable("请先选择一个会话。");
  }

  const readiness = workspace.setup.readiness;
  if (readiness.kind === "unavailable") {
    return unavailable(readinessUnavailableMessage(readiness.reason));
  }
  if (
    workspace.setup.conversationId !== selected.id ||
    workspace.setup.modelKey !== selected.modelKey ||
    readiness.value.modelKey !== selected.modelKey
  ) {
    return unavailable("当前会话的发送状态尚未就绪。");
  }
  if (!workspace.setup.modelKnown) {
    return unavailable("当前会话使用的模型已不可用。");
  }
  if (
    !readiness.value.ready ||
    readiness.value.reason !== "ready"
  ) {
    return unavailable(readinessReasonMessage(readiness.value.reason));
  }

  return {
    enabled: true,
    placeholder: "输入消息…",
    statusMessage: null,
  };
}

function unavailable(message: string): ChatSenderAvailability {
  return { enabled: false, placeholder: message, statusMessage: message };
}

function readinessReasonMessage(reason: ChatSetupStatus): string {
  switch (reason) {
    case "unknown-model":
      return "当前会话使用的模型已不可用。";
    case "provider-not-configured":
      return "当前模型服务尚未配置完成。";
    case "generation-not-supported":
      return "当前模型暂不支持生成。";
    case "configuration-invalid":
      return "当前模型服务配置不可用。";
    case "ready":
      return "当前发送服务尚未就绪。";
  }
}

function readinessUnavailableMessage(reason: string): string {
  switch (reason) {
    case "network":
    case "timeout":
    case "service":
      return "当前发送服务暂时不可用。";
    case "not-found":
      return "当前发送服务尚未就绪。";
    case "contract":
    case "unknown":
    default:
      return "当前无法确认发送服务状态。";
  }
}
