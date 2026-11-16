import { isChatExecutionActive, type ChatSendState } from "@/application/chat-send";
import type { ChatWorkspaceControllerState } from "./chat-workspace-controller";
import { scopedChatExecution } from "./chat-sender-policy";

export function messageDeleteWorkspaceReason(state: ChatWorkspaceControllerState, execution: ChatSendState): string | null {
  if (state.status !== "ready" || !state.workspace.history || !state.workspace.selectedConversationId) return "会话尚未就绪。";
  if (state.pendingConversationId || state.conversationMutation || state.historyNavigationPending) return "正在更新会话，请稍后删除。";
  execution = scopedChatExecution(execution, state.workspace.selectedConversationId);
  if (isChatExecutionActive(execution) || (execution.kind === "error" && !execution.confirmedFailure && !execution.rejectedSubmission)) {
    return "正在生成或核对回复，完成后可删除。";
  }
  return null;
}
