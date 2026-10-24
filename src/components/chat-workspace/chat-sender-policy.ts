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
  if (workspaceState.configurationPending) return unavailable("正在保存并确认模型选择。");
  if (workspaceState.conversationMutation) return unavailable("正在更新会话。");

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
    readiness.value.modelKey !== workspace.setup.modelKey
  ) {
    return unavailable("当前会话的发送状态尚未就绪。");
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

export function readinessReasonMessage(reason: ChatSetupStatus): string {
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
    default:
      return `${mainDiagnosticMessage(reason)}（${reason}）`;
  }
}

export function mainDiagnosticMessage(code: string): string {
  if (["main_default_not_selected", "main_selection_required", "literal_model_required", "invalid_main_selection", "duplicate_main_selection", "conflicting_main_selection"].includes(code)) return "请选择有效的连接、协议和模型。";
  if (code === "missing_credential") return "当前连接缺少凭据，请在设置中配置。";
  if (code === "disabled_profile") return "当前连接已禁用，请更正选择或在设置中启用。";
  if (["missing_profile", "invalid_connection", "invalid_profile", "incompatible_protocol"].includes(code)) return "当前连接或协议不可用，请更正选择。";
  if (code === "conversation_not_found") return "当前会话已不存在，请重新读取会话列表。";
  if (["missing_base_url", "invalid_base_url", "invalid_registry_configuration"].includes(code)) return "连接配置不完整或无效，请检查设置。";
  if (code.includes("legacy") || code === "malformed_api_configs") return "历史模型选择需要确认，请明确选择连接、协议和模型。";
  return "当前无法确认模型可执行，请检查选择并重新读取状态。";
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
