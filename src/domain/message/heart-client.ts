import { apiGet, type ApiRequestOptions } from "@/lib/api";
import { MessageContractError } from "./message-types";

export async function readMessageHeart(messageId: string, conversationId: string, options?: ApiRequestOptions): Promise<string[]> {
  const payload = await apiGet<unknown>(`/api/heart-whispers/by-msg/${encodeURIComponent(messageId)}`, options);
  if (!Array.isArray(payload)) throw new MessageContractError("Invalid heart response");
  return payload.flatMap(item => typeof item === "object" && item !== null && item.msg_id === messageId && item.conv_id === conversationId &&
    typeof item.id === "string" && typeof item.content === "string" ? [item.content] : []);
}
