import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatSetupContractError,
  type ChatSetupViewModel,
} from "@/application/chat-setup";
import {
  MessageHistoryContractError,
  type MessageHistoryState,
} from "@/application/message-history";
import * as chatWorkspace from "@/application/chat-workspace";
import {
  ChatWorkspaceContractError,
  createChatWorkspaceSnapshot,
  loadChatWorkspace,
  loadChatWorkspaceConversation,
  resolveWorkspaceConversationSelection,
} from "@/application/chat-workspace";
import {
  ConversationContractError,
  type ConversationSummary,
} from "@/domain/conversation";
import { MessageContractError, type Message } from "@/domain/message";
import { RuntimeContractError } from "@/domain/runtime";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  loadBootstrapChatSetup: vi.fn(),
  loadInitialMessageHistory: vi.fn(),
  listConversations: vi.fn(),
}));

vi.mock("@/application/chat-setup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/application/chat-setup")>()),
  loadBootstrapChatSetup: mocks.loadBootstrapChatSetup,
}));

vi.mock("@/application/message-history", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/application/message-history")>()),
  loadInitialMessageHistory: mocks.loadInitialMessageHistory,
}));

vi.mock("@/domain/conversation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/conversation")>()),
  listConversations: mocks.listConversations,
}));

beforeEach(() => {
  mocks.loadBootstrapChatSetup.mockReset();
  mocks.loadInitialMessageHistory.mockReset();
  mocks.listConversations.mockReset();
  mocks.loadBootstrapChatSetup.mockResolvedValue(setup());
  mocks.listConversations.mockResolvedValue(conversations());
  mocks.loadInitialMessageHistory.mockImplementation((conversationId, options) =>
    Promise.resolve(history(conversationId, [], options?.pageSize)),
  );
});

describe("chat workspace selection policy", () => {
  it("selects an existing preferred ID without changing list order", () => {
    const list = conversations();
    const idsBefore = list.map(({ id }) => id);

    const selected = resolveWorkspaceConversationSelection(list, {
      preferredConversationId: "conv_b",
    });

    expect(selected).toBe(list[1]);
    expect(list.map(({ id }) => id)).toEqual(idsBefore);
  });

  it("falls back to the first list item when a preferred ID is absent", () => {
    const list = conversations();

    expect(resolveWorkspaceConversationSelection(list, {
      preferredConversationId: "not-in-the-list",
    })).toBe(list[0]);
  });

  it("keeps a current selection that still exists before applying fallback", () => {
    const list = conversations();

    expect(resolveWorkspaceConversationSelection(list, {
      currentConversationId: "conv_b",
      preferredConversationId: "conv_a",
    })).toBe(list[1]);
  });

  it("re-resolves a deleted current selection through preferred then first-item policy", () => {
    const list = conversations();

    expect(resolveWorkspaceConversationSelection(list, {
      currentConversationId: "deleted",
      preferredConversationId: "conv_b",
    })).toBe(list[1]);
    expect(resolveWorkspaceConversationSelection(list, {
      currentConversationId: "deleted",
      preferredConversationId: "also-deleted",
    })).toBe(list[0]);
  });

  it("returns no selection for an empty conversation list", () => {
    expect(resolveWorkspaceConversationSelection([])).toBeNull();
  });

  it("uses list position rather than model or message count for initial selection", () => {
    const list = [
      conversation("first", { modelKey: "model-last", messageCount: 0 }),
      conversation("mock-looking-id", {
        modelKey: setup().models[0]!.key,
        messageCount: 999,
      }),
    ];

    expect(resolveWorkspaceConversationSelection(list)).toBe(list[0]);
  });

  it("rejects invalid selection input without exposing the supplied value", () => {
    const fakeSecret = "fake-selection-secret";
    const error = captureSyncError(() =>
      resolveWorkspaceConversationSelection(conversations(), {
        preferredConversationId: { fakeSecret } as unknown as string,
      }),
    );

    expect(error).toBeInstanceOf(ChatWorkspaceContractError);
    expect(String(error)).not.toContain(fakeSecret);
  });
});

describe("chat workspace bootstrap", () => {
  it("loads setup and list once, then loads at most one selected history", async () => {
    const request: ApiRequestOptions = {
      signal: new AbortController().signal,
      timeoutMs: 123,
      headers: { "x-workspace": "test" },
    };

    const workspace = await loadChatWorkspace({}, request);

    expect(mocks.loadBootstrapChatSetup).toHaveBeenCalledOnce();
    expect(mocks.loadBootstrapChatSetup).toHaveBeenCalledWith(request);
    expect(mocks.listConversations).toHaveBeenCalledOnce();
    expect(mocks.listConversations).toHaveBeenCalledWith(request);
    expect(mocks.loadInitialMessageHistory).toHaveBeenCalledOnce();
    expect(mocks.loadInitialMessageHistory).toHaveBeenCalledWith("conv_a", {
      pageSize: undefined,
      request,
    });
    expect(workspace).toMatchObject({
      selectedConversationId: "conv_a",
      selectedConversation: { id: "conv_a" },
      history: { conversationId: "conv_a" },
    });
  });

  it("honors preferred ID and explicit history page size", async () => {
    const workspace = await loadChatWorkspace({
      preferredConversationId: "conv_b",
      historyPageSize: 25,
    });

    expect(mocks.loadInitialMessageHistory).toHaveBeenCalledWith("conv_b", {
      pageSize: 25,
      request: undefined,
    });
    expect(workspace.selectedConversationId).toBe("conv_b");
    expect(workspace.history?.pageSize).toBe(25);
  });

  it("keeps a valid current selection when bootstrap data is reloaded", async () => {
    const workspace = await loadChatWorkspace({
      currentConversationId: "conv_b",
      preferredConversationId: "conv_a",
    });

    expect(workspace.selectedConversationId).toBe("conv_b");
  });

  it("does not request history when the real conversation list is empty", async () => {
    mocks.listConversations.mockResolvedValue([]);

    const workspace = await loadChatWorkspace();

    expect(workspace).toEqual({
      setup: setup(),
      conversations: [],
      selectedConversationId: null,
      selectedConversation: null,
      history: null,
    });
    expect(mocks.loadInitialMessageHistory).not.toHaveBeenCalled();
  });

  it("keeps an empty persisted history as a valid selected workspace", async () => {
    mocks.loadInitialMessageHistory.mockResolvedValue(history("conv_a"));

    const workspace = await loadChatWorkspace();

    expect(workspace.history).toEqual(history("conv_a"));
    expect(workspace.history?.messages).toEqual([]);
  });

  it("rejects a mismatched history without leaking history content", async () => {
    const fakeContent = "fake-history-message-content";
    mocks.loadInitialMessageHistory.mockResolvedValue(history("conv_b", [
      message("conv_b", 10, fakeContent),
    ]));

    const error = await loadChatWorkspace().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ChatWorkspaceContractError);
    expect(String(error)).not.toContain(fakeContent);
  });

  it.each([
    new ApiError("safe transport", 503),
    new RuntimeContractError("safe runtime"),
    new ChatSetupContractError("safe setup"),
    new ConversationContractError("safe conversation"),
    new MessageContractError("safe message"),
    new MessageHistoryContractError("safe history"),
  ])("preserves setup/list/history errors without wrapping: %s", async (expected) => {
    if (expected instanceof ConversationContractError) {
      mocks.listConversations.mockRejectedValue(expected);
    } else if (
      expected instanceof MessageContractError ||
      expected instanceof MessageHistoryContractError
    ) {
      mocks.loadInitialMessageHistory.mockRejectedValue(expected);
    } else {
      mocks.loadBootstrapChatSetup.mockRejectedValue(expected);
    }

    const actual = await loadChatWorkspace().catch((reason: unknown) => reason);

    expect(actual).toBe(expected);
  });

  it("rejects invalid application input before calling any loader", async () => {
    const error = await loadChatWorkspace({
      historyPageSize: 0,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ChatWorkspaceContractError);
    expect(mocks.loadBootstrapChatSetup).not.toHaveBeenCalled();
    expect(mocks.listConversations).not.toHaveBeenCalled();
    expect(mocks.loadInitialMessageHistory).not.toHaveBeenCalled();
  });
});

describe("chat workspace conversation switch", () => {
  it("loads only the target history and atomically returns the new selection", async () => {
    const original = await loadChatWorkspace();
    mocks.loadInitialMessageHistory.mockClear();
    const before = structuredClone(original);
    const request = { signal: new AbortController().signal, timeoutMs: 50 };

    const switched = await loadChatWorkspaceConversation(
      original,
      "conv_b",
      request,
    );

    expect(mocks.loadInitialMessageHistory).toHaveBeenCalledOnce();
    expect(mocks.loadInitialMessageHistory).toHaveBeenCalledWith("conv_b", {
      pageSize: 50,
      request,
    });
    expect(switched).toMatchObject({
      selectedConversationId: "conv_b",
      selectedConversation: { id: "conv_b" },
      history: { conversationId: "conv_b" },
    });
    expect(switched.setup).toBe(original.setup);
    expect(switched.conversations).toBe(original.conversations);
    expect(original).toEqual(before);
  });

  it("accepts an empty target history and createdAt=0", async () => {
    const original = await loadChatWorkspace();
    mocks.loadInitialMessageHistory.mockResolvedValue(history("conv_b", [
      message("conv_b", 0),
    ]));

    const withEpoch = await loadChatWorkspaceConversation(original, "conv_b");
    mocks.loadInitialMessageHistory.mockResolvedValue(history("conv_a"));
    const empty = await loadChatWorkspaceConversation(withEpoch, "conv_a");

    expect(withEpoch.history?.oldestCursor).toBe(0);
    expect(empty.history?.messages).toEqual([]);
  });

  it("rejects an unknown ID before requesting history and never falls back", async () => {
    const original = await loadChatWorkspace();
    mocks.loadInitialMessageHistory.mockClear();

    const error = await loadChatWorkspaceConversation(
      original,
      "unknown",
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ChatWorkspaceContractError);
    expect(mocks.loadInitialMessageHistory).not.toHaveBeenCalled();
  });

  it("preserves target history errors without changing the input snapshot", async () => {
    const original = await loadChatWorkspace();
    const expected = new ApiError("history failed", 500);
    mocks.loadInitialMessageHistory.mockRejectedValue(expected);

    const actual = await loadChatWorkspaceConversation(
      original,
      "conv_b",
    ).catch((reason: unknown) => reason);

    expect(actual).toBe(expected);
    expect(original.selectedConversationId).toBe("conv_a");
    expect(original.history?.conversationId).toBe("conv_a");
  });
});

describe("chat workspace snapshot contract and public surface", () => {
  it("rejects selected/history inconsistencies with safe application errors", () => {
    const fakeSecret = "fake-snapshot-secret";
    const errors = [
      captureSyncError(() => createChatWorkspaceSnapshot({
        setup: setup(),
        conversations: conversations(),
        selectedConversation: null,
        history: history("conv_a", [message("conv_a", 1, fakeSecret)]),
      })),
      captureSyncError(() => createChatWorkspaceSnapshot({
        setup: setup(),
        conversations: conversations(),
        selectedConversation: conversation("missing"),
        history: history("missing"),
      })),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(ChatWorkspaceContractError);
      expect(String(error)).not.toContain(fakeSecret);
    }
  });

  it("exports only read-model application capabilities", () => {
    expect(Object.keys(chatWorkspace).sort()).toEqual([
      "ChatWorkspaceContractError",
      "assertChatWorkspaceSnapshot",
      "createChatWorkspaceSnapshot",
      "loadChatWorkspace",
      "loadChatWorkspaceConversation",
      "resolveWorkspaceConversationSelection",
    ]);
    expect(chatWorkspace).not.toHaveProperty("openSendExecution");
    expect(chatWorkspace).not.toHaveProperty("openRealtimeEvents");
    expect(chatWorkspace).not.toHaveProperty("reconcileRealtimeEvent");
    expect(chatWorkspace).not.toHaveProperty("loadSettingsOverview");
    expect(chatWorkspace).not.toHaveProperty("fetch");
  });
});

function setup(): ChatSetupViewModel {
  return {
    conversationId: null,
    conversationTitle: null,
    modelKey: "backend-default",
    modelLabel: "Backend default",
    modelKnown: true,
    models: [
      {
        key: "backend-default",
        label: "Backend default",
        provider: "provider-a",
        selected: true,
      },
    ],
    status: "ready",
    setupActionRequired: false,
  };
}

function conversations(): ConversationSummary[] {
  return [conversation("conv_a"), conversation("conv_b")];
}

function conversation(
  id: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    title: `Conversation ${id}`,
    modelKey: "model-a",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 0,
    ...overrides,
  };
}

function history(
  conversationId: string,
  messages: readonly Message[] = [],
  pageSize = 50,
): MessageHistoryState {
  return {
    conversationId,
    messages,
    pageSize,
    oldestCursor: messages[0]?.createdAt ?? null,
    olderPageStatus: "exhausted",
  };
}

function message(
  conversationId: string,
  createdAt: number,
  content = "safe content",
): Message {
  return {
    id: `msg-${createdAt}`,
    conversationId,
    rawRole: "user",
    roleKind: "user",
    content,
    createdAt,
    simpleThink: null,
    thinking: null,
    isCarryover: false,
    attachments: [],
    mcpToolCalls: [],
    cacheRegion: null,
    voice: null,
  };
}

function captureSyncError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error("Expected callback to throw");
}
