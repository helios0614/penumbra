import { apiRequest } from "@/lib/api";
import { readPublicMessage } from "./message-client";
import type { Message } from "./message-types";

export class MessageEditError extends Error {}

/** The legacy PUT acknowledges even missing IDs. Only an HTTP reread confirms a save. */
export async function editMessageContent(original: Message, content: string): Promise<Message> {
  if (!original.id || !original.conversationId || !["user", "assistant"].includes(original.rawRole)) {
    throw new MessageEditError("这条消息没有可编辑的持久化身份。");
  }
  const checkIdentity = (message: Message) => {
    if (message.id !== original.id || message.conversationId !== original.conversationId || message.rawRole !== original.rawRole) {
      throw new MessageEditError("消息身份已变化，请关闭编辑并刷新后核对。");
    }
  };
  const current = await readPublicMessage(original.id);
  checkIdentity(current);
  // Also handles a previous PUT succeeding while its response/readback was lost.
  if (current.content === content) return current;
  if (current.content !== original.content) {
    throw new MessageEditError("消息正文已变化，编辑内容已保留。请关闭编辑并刷新后核对。");
  }
  const result = await apiRequest<unknown>(`/api/messages/${encodeURIComponent(original.id)}`, {
    method: "PUT", body: { content },
  });
  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
    throw new MessageEditError("尚未确认保存，编辑内容已保留，请重试或刷新核对。");
  }
  const saved = await readPublicMessage(original.id);
  checkIdentity(saved);
  if (saved.content !== content) {
    throw new MessageEditError("读回的正文与编辑内容不一致，请刷新核对。编辑内容已保留。");
  }
  return saved;
}
