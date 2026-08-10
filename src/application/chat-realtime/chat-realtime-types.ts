import type { RealtimeConnection, RealtimeEvent } from "@/application/realtime";

export type SafeRealtimeReason =
  | "authentication"
  | "network"
  | "contract"
  | "service"
  | "unknown";

export type ChatRealtimeState =
  | { readonly kind: "idle" }
  | { readonly kind: "connecting" }
  | { readonly kind: "connected" }
  | { readonly kind: "reconnecting" }
  | {
      readonly kind: "unavailable";
      readonly reason: SafeRealtimeReason;
    };

export type ChatRealtimeExecutionContext =
  | { readonly kind: "idle" }
  | {
      readonly kind: "active";
      readonly conversationId: string;
      readonly userMessageId: string;
      readonly assistantMessageId: string | null;
    };

export type ChatRealtimeContext = {
  readonly workspaceAvailable: boolean;
  readonly authenticated: boolean;
  readonly selectedConversationId: string | null;
  readonly execution: ChatRealtimeExecutionContext;
};

export type RealtimeDirtyState = {
  readonly currentConversationHistory: boolean;
  readonly conversationList: boolean;
};

export type ChatRealtimeConnectionOpener = (
  options?: { readonly signal?: AbortSignal },
) => Promise<RealtimeConnection>;

export type ChatRealtimeCoordinatorDependencies = {
  readonly openConnection?: ChatRealtimeConnectionOpener;
  readonly getContext: () => ChatRealtimeContext;
  readonly reconcileEvent: (event: RealtimeEvent) => Promise<void>;
  readonly reconcileAfterReconnect: (
    conversationId: string,
  ) => Promise<void>;
  readonly refreshConversationList: () => Promise<void>;
  readonly queueTask?: (task: () => void) => void;
  readonly scheduleReconnect?: (
    task: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  readonly cancelReconnect?: (
    timer: ReturnType<typeof setTimeout>,
  ) => void;
};

export interface ChatRealtimeCoordinator {
  getState(): ChatRealtimeState;
  getDirtyState(): RealtimeDirtyState;
  start(): void;
  stop(): void;
  contextChanged(): void;
  handleEvent(event: RealtimeEvent): Promise<void>;
  retryReconciliation(): void;
  subscribe(listener: (state: ChatRealtimeState) => void): () => void;
}

export const INITIAL_CHAT_REALTIME_STATE: ChatRealtimeState = Object.freeze({
  kind: "idle",
});

export const INITIAL_REALTIME_DIRTY_STATE: RealtimeDirtyState = Object.freeze({
  currentConversationHistory: false,
  conversationList: false,
});
