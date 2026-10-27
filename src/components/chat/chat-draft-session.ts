import { createAttachmentDraftStore } from "@/application/chat-media/attachment-drafts";
import type { SenderDraft } from "./composer-draft";

export const mainChatDraftSession = { texts: new Map<string, SenderDraft>(), attachments: createAttachmentDraftStore() };
export type ChatDraftSession = typeof mainChatDraftSession;
