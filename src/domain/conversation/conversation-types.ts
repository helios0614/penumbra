export type Conversation = {
  id: string;
  title: string;
  modelKey: string;
  createdAt: number;
  updatedAt: number;
};

export type ConversationSummary = Conversation & {
  messageCount: number;
};

export type CreateConversationInput = {
  title?: string;
  modelKey?: string;
};

export type UpdateConversationInput = {
  title?: string | null;
  modelKey?: string | null;
};

export type ConversationMutationResult = {
  ok: true;
};

export class ConversationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationContractError";
  }
}
