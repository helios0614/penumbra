import type { MainSelection } from "@/domain/runtime/main-configuration";

export type Conversation = {
  id: string;
  title: string;
  modelKey: string;
  readonly mainSelection?: MainSelection | null;
  readonly mainSelectionDiagnostic?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ConversationSummary = Conversation & {
  messageCount: number;
};

export type CreateConversationInput = {
  title?: string;
  modelKey?: string;
  carryoverSourceConversationId?: string;
};

export type UpdateConversationInput = {
  title?: string | null;
  modelKey?: string | null;
  mainSelection?: MainSelection;
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
