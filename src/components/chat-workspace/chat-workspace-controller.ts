import {
  loadChatWorkspace,
  loadChatWorkspaceConversation,
  type ChatWorkspaceLoadInput,
  type ChatWorkspaceSnapshot,
} from "@/application/chat-workspace";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

export type ChatWorkspaceSafeUiErrorCode =
  | "authentication"
  | "network"
  | "timeout"
  | "service"
  | "contract"
  | "unknown";

export type ChatWorkspaceSafeUiError = {
  readonly code: ChatWorkspaceSafeUiErrorCode;
  readonly message: string;
};

export type ChatWorkspaceControllerState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly workspace: ChatWorkspaceSnapshot;
      readonly pendingConversationId: string | null;
      readonly switchError: ChatWorkspaceSafeUiError | null;
    }
  | {
      readonly status: "error";
      readonly error: ChatWorkspaceSafeUiError;
    };

export const INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE: ChatWorkspaceControllerState = {
  status: "idle",
};

export type ChatWorkspaceBootstrapLoader = (
  input?: ChatWorkspaceLoadInput,
  options?: ApiRequestOptions,
) => Promise<ChatWorkspaceSnapshot>;

export type ChatWorkspaceConversationLoader = (
  snapshot: ChatWorkspaceSnapshot,
  conversationId: string,
  options?: ApiRequestOptions,
) => Promise<ChatWorkspaceSnapshot>;

export type ChatWorkspaceControllerDependencies = {
  readonly loadWorkspace?: ChatWorkspaceBootstrapLoader;
  readonly loadConversation?: ChatWorkspaceConversationLoader;
};

export interface ChatWorkspaceController {
  getState(): ChatWorkspaceControllerState;
  load(): Promise<void>;
  retry(): Promise<void>;
  selectConversation(conversationId: string): Promise<void>;
  retryConversationSwitch(): Promise<void>;
  subscribe(listener: (state: ChatWorkspaceControllerState) => void): () => void;
  dispose(): void;
}

export function createChatWorkspaceController(
  input: ChatWorkspaceLoadInput = {},
  dependencies: ChatWorkspaceControllerDependencies = {},
): ChatWorkspaceController {
  const bootstrapLoader = dependencies.loadWorkspace ?? loadChatWorkspace;
  const conversationLoader =
    dependencies.loadConversation ?? loadChatWorkspaceConversation;
  let state = INITIAL_CHAT_WORKSPACE_CONTROLLER_STATE;
  let bootstrapController: AbortController | null = null;
  let switchController: AbortController | null = null;
  let bootstrapSequence = 0;
  let switchSequence = 0;
  let lastFailedConversationId: string | null = null;
  let disposed = false;
  const listeners = new Set<(state: ChatWorkspaceControllerState) => void>();

  const publish = (nextState: ChatWorkspaceControllerState) => {
    if (disposed) return;
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const load = async () => {
    if (disposed) return;

    const currentConversationId =
      state.status === "ready"
        ? state.workspace.selectedConversationId
        : input.currentConversationId;
    const sequence = ++bootstrapSequence;

    bootstrapController?.abort();
    bootstrapController = new AbortController();
    const controller = bootstrapController;

    switchSequence += 1;
    switchController?.abort();
    switchController = null;
    lastFailedConversationId = null;

    publish({ status: "loading" });

    try {
      const workspace = await bootstrapLoader(
        { ...input, currentConversationId },
        { signal: controller.signal },
      );
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== bootstrapSequence
      ) {
        return;
      }

      publish(readyState(workspace));
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== bootstrapSequence ||
        isAbortError(error)
      ) {
        return;
      }

      publish({ status: "error", error: toSafeUiError(error) });
    } finally {
      if (sequence === bootstrapSequence && bootstrapController === controller) {
        bootstrapController = null;
      }
    }
  };

  const selectConversation = async (conversationId: string) => {
    if (disposed || state.status !== "ready") return;

    const workspace = state.workspace;
    const sequence = ++switchSequence;
    switchController?.abort();
    switchController = null;
    lastFailedConversationId = null;

    if (conversationId === workspace.selectedConversationId) {
      publish(readyState(workspace));
      return;
    }

    const controller = new AbortController();
    switchController = controller;
    publish({
      status: "ready",
      workspace,
      pendingConversationId: conversationId,
      switchError: null,
    });

    try {
      const nextWorkspace = await conversationLoader(
        workspace,
        conversationId,
        { signal: controller.signal },
      );
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== switchSequence
      ) {
        return;
      }

      publish(readyState(nextWorkspace));
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        sequence !== switchSequence ||
        isAbortError(error)
      ) {
        return;
      }

      lastFailedConversationId = conversationId;
      publish({
        status: "ready",
        workspace,
        pendingConversationId: null,
        switchError: toSafeUiError(error),
      });
    } finally {
      if (sequence === switchSequence && switchController === controller) {
        switchController = null;
      }
    }
  };

  return {
    getState() {
      return state;
    },

    load,

    retry: load,

    selectConversation,

    async retryConversationSwitch() {
      if (
        disposed ||
        state.status !== "ready" ||
        state.pendingConversationId !== null ||
        lastFailedConversationId === null
      ) {
        return;
      }

      await selectConversation(lastFailedConversationId);
    },

    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      bootstrapSequence += 1;
      switchSequence += 1;
      listeners.clear();
      bootstrapController?.abort();
      switchController?.abort();
      bootstrapController = null;
      switchController = null;
      lastFailedConversationId = null;
    },
  };
}

export function toSafeUiError(error: unknown): ChatWorkspaceSafeUiError {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        code: "authentication",
        message: "会话读取需要重新登录或授权。",
      };
    }
    if (error.code === "TIMEOUT") {
      return { code: "timeout", message: "会话读取超时，请重试。" };
    }
    if (error.code === "NETWORK_ERROR") {
      return { code: "network", message: "暂时无法连接服务，请重试。" };
    }
    return { code: "service", message: "暂时无法读取会话，请重试。" };
  }

  if (error instanceof Error && error.name.endsWith("ContractError")) {
    return {
      code: "contract",
      message: "会话数据暂时无法使用，请重试。",
    };
  }

  return { code: "unknown", message: "读取会话时发生错误，请重试。" };
}

function readyState(
  workspace: ChatWorkspaceSnapshot,
): ChatWorkspaceControllerState {
  return {
    status: "ready",
    workspace,
    pendingConversationId: null,
    switchError: null,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === "ABORTED") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
