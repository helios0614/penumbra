import { apiGet } from "@/lib/api";
import { ChatExecutionContractError } from "@/application/chat-execution";

export type ChatSendResult = {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string | null;
};

/** Read-only identity lookup. Missing/old-server receipts never authorize a retry. */
export async function readChatSendResult(conversationId: string, clientMessageId: string): Promise<ChatSendResult> {
  const value = await apiGet<unknown>(`/api/conversations/${encodeURIComponent(conversationId)}/send-results/${encodeURIComponent(clientMessageId)}`);
  if (!value || typeof value !== "object") throw new ChatExecutionContractError("Invalid send result");
  const row = value as Record<string, unknown>;
  if (row.conv_id !== conversationId || row.client_msg_id !== clientMessageId ||
      typeof row.user_message_id !== "string" || !row.user_message_id ||
      !(row.assistant_message_id === null || typeof row.assistant_message_id === "string" && row.assistant_message_id.length > 0)) {
    throw new ChatExecutionContractError("Send result identity mismatch");
  }
  return { conversationId, clientMessageId, userMessageId: row.user_message_id, assistantMessageId: row.assistant_message_id };
}
