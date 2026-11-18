import { type ChatSendState } from "@/application/chat-send";
import { isCurrentSendUser } from "./chat-message-edit-policy";
import type { ChatWorkspaceControllerState } from "./chat-workspace-controller";
import { scopedChatExecution } from "./chat-sender-policy";

export function messageDeleteWorkspaceReason(state: ChatWorkspaceControllerState, execution: ChatSendState, messageId?: string): string | null {
  if (state.status !== "ready" || !state.workspace.history || !state.workspace.selectedConversationId) return "会话尚未就绪。";
  if (state.pendingConversationId || state.conversationMutation || state.historyNavigationPending) return "正在更新会话，请稍后删除。";
  execution = scopedChatExecution(execution, state.workspace.selectedConversationId);
  if (isCurrentSendUser(execution, messageId)) return "当前请求的 User 消息须等执行终结后删除。";
  return null;
}
