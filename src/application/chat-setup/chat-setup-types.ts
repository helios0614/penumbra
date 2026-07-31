import type { Conversation } from "@/domain/conversation";
import type {
  AvailableModel,
  ChatReadiness,
  ChatReadinessReason,
} from "@/domain/runtime";

export type ChatSetupModelOption = {
  key: string;
  label: string;
  provider: string;
  selected: boolean;
};

export type ChatSetupStatus = ChatReadinessReason;

export type ChatSetupViewModel = {
  conversationId: string | null;
  conversationTitle: string | null;
  modelKey: string;
  modelLabel: string;
  modelKnown: boolean;
  models: ChatSetupModelOption[];
  status: ChatSetupStatus;
  setupActionRequired: boolean;
};

export type CreateChatSetupViewModelInput = {
  conversation: Conversation | null;
  availableModels: readonly AvailableModel[];
  readiness: ChatReadiness;
};

export class ChatSetupContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatSetupContractError";
  }
}
