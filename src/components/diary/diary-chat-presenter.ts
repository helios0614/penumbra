import type { DiaryMessage } from "@/domain/diary/diary-chat-types";
import type { ChatMessageViewModel } from "@/components/chat/chat-ui-types";
import type { DiaryChatOverlay } from "@/application/diary-chat/diary-chat-send";

/** Keep HTTP order; an overlay can only replace an exact (Entry, message) identity. */
export function presentDiaryTimeline(entryId: string, history: readonly DiaryMessage[] | null, overlays: readonly DiaryChatOverlay[]): ChatMessageViewModel[] {
  const local = new Map(overlays.filter(row => row.message.entryId === entryId).map(row => [row.message.id, row]));
  const present = (row: DiaryChatOverlay) => ({ ...presentDiaryMessage(row.message), executionStatus: row.status });
  const result = (history ?? []).map(message => {
    const overlay = local.get(message.id); local.delete(message.id);
    return overlay ? present(overlay) : presentDiaryMessage(message);
  });
  return [...result, ...[...local.values()].map(present)];
}

/** Project saved Diary facts directly to display values, never via Main Message DTO. */
export function presentDiaryMessage(message: DiaryMessage): ChatMessageViewModel {
  const base = { id: message.id, content: message.content, createdAt: message.createdAt };
  if (message.role === "user") return { ...base, kind: "user", attachments: [] };
  if (message.role === "assistant") return { ...base, kind: "assistant", thinking: message.thinking, simpleThink: message.drift, attachments: [], insertable: false };
  // Main system capabilities are not Diary's grammar. Keep unfamiliar persisted prose visible.
  return { ...base, kind: "unknown", rawRole: message.role };
}
