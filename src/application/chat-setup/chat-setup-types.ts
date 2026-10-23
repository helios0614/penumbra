import type { Conversation } from "@/domain/conversation";
import type {
  AvailableModel,
  ChatReadiness,
  ChatReadinessReason,
  MainConfiguration,
} from "@/domain/runtime";

export type ChatSetupModelOption = {
  key: string;
  label: string;
  provider: string;
  selected: boolean;
};

export type ChatSetupStatus = ChatReadinessReason | "generation-not-supported";

export type ChatSetupReadiness = Omit<
  ChatReadiness,
  "reason" | "generationUnsupported"
> & {
  readonly reason: ChatSetupStatus;
};

export type SafeReadinessReason =
  | "not-found"
  | "network"
  | "timeout"
  | "service"
  | "contract"
  | "unknown";

export type ChatReadinessState =
  | {
      readonly kind: "available";
      readonly value: ChatSetupReadiness;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: SafeReadinessReason;
    };

export type ChatSetupViewModel = {
  conversationId: string | null;
  conversationTitle: string | null;
  modelKey: string | null;
  modelLabel: string | null;
  modelKnown: boolean;
  models: ChatSetupModelOption[];
  status: ChatSetupStatus | "readiness-unavailable";
  setupActionRequired: boolean;
  readiness: ChatReadinessState;
  readonly configuration?: MainConfiguration | null;
};

export type CreateChatSetupViewModelInput = {
  conversation: Conversation | null;
  availableModels: readonly AvailableModel[];
  readiness: ChatReadiness;
  configuration?: MainConfiguration;
};

export type CreateUnavailableChatSetupViewModelInput = {
  conversation: Conversation | null;
  availableModels: readonly AvailableModel[];
  reason: SafeReadinessReason;
  configuration?: MainConfiguration | null;
};

export class ChatSetupContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatSetupContractError";
  }
}
