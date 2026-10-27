import { readMessageWindow } from "@/domain/message";
import { createRegeneratePersistenceProjection, type ChatHistoryReconciliationResult } from "./chat-regenerate-persistence";

/** Detached reads never publish into the selected Workspace or move its window. */
export async function reconcileBackgroundChat(conversationId: string, targetId?: string): Promise<ChatHistoryReconciliationResult> {
  const history = await readMessageWindow(conversationId, targetId ? { anchorId: targetId } : {});
  const assistants = history.messages.filter(row => row.roleKind === "assistant").map(createRegeneratePersistenceProjection);
  return { persistedMessageIds: history.messages.map(row => row.id), assistants, regenerateTarget: assistants.find(row => row.id === targetId) ?? null };
}
