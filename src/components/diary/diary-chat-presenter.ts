import type { DiaryMessage } from "@/domain/diary/diary-chat-types";
import type { ChatMessageViewModel } from "@/components/chat/chat-ui-types";

/** Project saved Diary facts directly to display values, never via Main Message DTO. */
export function presentDiaryMessage(message: DiaryMessage): ChatMessageViewModel {
  const base = { id: message.id, content: message.content, createdAt: message.createdAt };
  if (message.role === "user") return { ...base, kind: "user", attachments: [] };
  if (message.role === "assistant") return { ...base, kind: "assistant", thinking: message.thinking, simpleThink: message.drift, attachments: [], insertable: false };
  // Main system capabilities are not Diary's grammar. Keep unfamiliar persisted prose visible.
  return { ...base, kind: "unknown", rawRole: message.role };
}
