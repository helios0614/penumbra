import { isChatExecutionActive, type ChatSendState } from "@/application/chat-send";
import type { Message } from "@/domain/message";
import type { ChatWorkspaceControllerState } from "./chat-workspace-controller";
import { scopedChatExecution } from "./chat-sender-policy";
import { presentChatMessage } from "./presentation/chat-message-presenter";

export function messageEditContentReason(message: Message): string | null {
  if (!message.id || !message.conversationId || !["user", "assistant"].includes(message.rawRole)) return "这条消息不可编辑。";
  // A whole-content PUT cannot safely replace just the body of legacy inline controls.
  if (message.roleKind === "assistant" && presentChatMessage(message)?.content !== message.content) {
    return "这条旧消息含内嵌控制内容，暂不能安全地只编辑正文。";
  }
  return null;
}

export function messageEditWorkspaceReason(state: ChatWorkspaceControllerState, execution: ChatSendState): string | null {
  if (state.status !== "ready" || !state.workspace.history || !state.workspace.selectedConversationId) return "会话尚未就绪。";
  if (state.pendingConversationId || state.conversationMutation || state.historyNavigationPending) return "正在更新会话，请稍后编辑。";
  execution = scopedChatExecution(execution, state.workspace.selectedConversationId);
  if (isChatExecutionActive(execution) || (execution.kind === "error" && !execution.confirmedFailure && !execution.rejectedSubmission)) {
    return "正在生成或核对回复，完成后可编辑。";
  }
  return null;
}
