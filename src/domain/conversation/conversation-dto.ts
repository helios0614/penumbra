export type ConversationDto = {
  id: string;
  title: string;
  model: string;
  created_at: number;
  updated_at: number;
};

export type ConversationListItemDto = ConversationDto & {
  message_count: number;
};

export type ConversationListDto = ConversationListItemDto[];

export type CreateConversationRequestDto = {
  title?: string;
  model?: string;
};

// The backend accepts null, but treats it the same as an omitted field.
export type UpdateConversationRequestDto = {
  title?: string | null;
  model?: string | null;
};

export type ConversationMutationResponseDto = {
  ok: true;
};
