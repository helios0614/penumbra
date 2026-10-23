export type ChatConversationItemViewModel = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly modelKey: string | null;
  readonly updatedAt: number | null;
  readonly isSelected: boolean;
  readonly isPending: boolean;
};

export type { ChatAttachmentViewModel, ChatMessageViewModel } from "@/components/chat/chat-ui-types";
