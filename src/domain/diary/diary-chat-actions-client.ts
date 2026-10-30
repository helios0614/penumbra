import { apiRequest } from "@/lib/api";
import { DiaryContractError } from "./diary-types";

export class DiaryMessageActionError extends Error {}

/** Legacy mutation acknowledgements do not prove a row was matched. Controller rereads history. */
export async function mutateDiaryMessage(entryId: string, messageId: string, content: string | null, signal: AbortSignal): Promise<void> {
  if (!entryId.trim() || !messageId.trim()) throw new DiaryContractError();
  const result = await apiRequest<unknown>(`/api/diary/entries/${encodeURIComponent(entryId)}/messages/${encodeURIComponent(messageId)}`, {
    method: content === null ? "DELETE" : "PUT", ...(content === null ? {} : { body: { content } }), signal,
  });
  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) throw new DiaryContractError();
}
