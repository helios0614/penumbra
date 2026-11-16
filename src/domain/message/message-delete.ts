import { apiGet, apiRequest, ApiError } from "@/lib/api";
import type { Message } from "./message-types";

export class MessageDeleteError extends Error {}

/** Legacy DELETE is idempotent, including missing IDs. Confirm absence over HTTP. */
export async function deleteMessage(message: Message): Promise<void> {
  if (!message.id || !message.conversationId || !["user", "assistant", "system"].includes(message.rawRole)) {
    throw new MessageDeleteError("这条消息没有可删除的持久化身份。");
  }
  const path = `/api/messages/${encodeURIComponent(message.id)}`;
  const result = await apiRequest<unknown>(path, { method: "DELETE" });
  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
    throw new MessageDeleteError("删除接口未确认成功，请刷新核对后重试。");
  }
  try { await apiGet<unknown>(`${path}/public`); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
  throw new MessageDeleteError("删除后仍能读到这条消息，请刷新核对后重试。");
}
