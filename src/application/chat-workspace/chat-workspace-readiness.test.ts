import { messageWindowWire } from "@/test-fixtures/message-window-wire";
import { mainConfigurationWire } from "@/test-fixtures/main-chat-wire";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadChatWorkspace } from "@/application/chat-workspace";
import { createChatWorkspaceController } from "@/components/chat-workspace";
import { ApiError } from "@/lib/api";

describe("chat workspace readiness degradation", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("keeps real conversations and initial history ready when readiness returns 404", async () => {
    const fakeEndpoint = "https://private-readiness.example";
    fetchMock.mockImplementation((input) => {
      const path = String(input).replace("conv_id=conv_b", "conv_id=conv_a");
      if (path === "/api/main/configuration?conv_id=conv_a") return Promise.resolve(json(mainConfigurationWire("conversation-model")));
      if (path === "/api/chat/readiness?conv_id=conv_a") {
        return Promise.resolve(json({
          error: "missing route",
          endpoint: fakeEndpoint,
          providerException: "private provider failure",
        }, 404));
      }
      if (path === "/api/conversations") {
        return Promise.resolve(json(conversationDtos()));
      }
      if (path === "/api/conversations/conv_a/messages/window?limit=50") {
        return Promise.resolve(json([messageDto("conv_a", "真实持久化历史")]));
      }
      return Promise.resolve(json({ error: "unexpected request" }, 500));
    });

    const workspace = await loadChatWorkspace({}, { timeoutMs: 0 });

    expect(workspace.setup.readiness).toEqual({
      kind: "unavailable",
      reason: "not-found",
    });
    expect(workspace.conversations.map(({ id }) => id)).toEqual(["conv_a", "conv_b"]);
    expect(workspace.selectedConversationId).toBe("conv_a");
    expect(workspace.history?.messages[0]?.content).toBe("真实持久化历史");
    expect(JSON.stringify(workspace)).not.toContain(fakeEndpoint);
    expect(requestPaths()).toEqual([
      "/api/conversations",
      "/api/main/configuration?conv_id=conv_a",
      "/api/chat/readiness?conv_id=conv_a",
      "/api/conversations/conv_a/messages/window?limit=50",
    ]);
    expect(requestPaths().join(" ")).not.toMatch(
      /send|regenerate|reconciliation|event-stream|\/ws|websocket|provider/,
    );
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("keeps the workspace readable on a readiness network failure without leaking details", async () => {
    const fakeEndpoint = "https://internal-readiness.example";
    fetchMock.mockImplementation((input) => {
      const path = String(input).replace("conv_id=conv_b", "conv_id=conv_a");
      if (path === "/api/chat/readiness?conv_id=conv_a") {
        return Promise.reject(new TypeError(fakeEndpoint));
      }
      return successfulReadResponse(path);
    });

    const workspace = await loadChatWorkspace({}, { timeoutMs: 0 });

    expect(workspace.setup.readiness).toEqual({
      kind: "unavailable",
      reason: "network",
    });
    expect(workspace.selectedConversationId).toBe("conv_a");
    expect(workspace.history?.messages).toHaveLength(1);
    expect(JSON.stringify(workspace)).not.toContain(fakeEndpoint);
  });

  it("preserves a successful not-ready response instead of inventing ready", async () => {
    fetchMock.mockImplementation((input) => {
      const path = String(input).replace("conv_id=conv_b", "conv_id=conv_a");
      if (path === "/api/chat/readiness?conv_id=conv_a") {
        return Promise.resolve(json(readinessDto(
          "provider_not_configured",
          "conversation-model",
        )));
      }
      return successfulReadResponse(path);
    });

    const workspace = await loadChatWorkspace({}, { timeoutMs: 0 });

    expect(workspace.setup.readiness).toEqual({
      kind: "available",
      value: {
        ready: false,
        modelKey: "conversation-model",
        reason: "provider-not-configured",
        setupActionRequired: true,
      },
    });
    expect(workspace.setup.status).toBe("provider-not-configured");
    expect(workspace.selectedConversationId).toBe("conv_a");
  });

  it("keeps conversation, authentication, and initial history failures fatal", async () => {
    const fatalCases = [
      {
        failingPath: "/api/conversations",
        response: json({ error: "conversation failure" }, 500),
        expected: { status: "error", error: { code: "service" } },
      },
      {
        failingPath: "/api/chat/readiness?conv_id=conv_a",
        response: json({ error: "unauthenticated" }, 401),
        expected: { status: "error", error: { code: "authentication" } },
      },
      {
        failingPath: "/api/conversations/conv_a/messages/window?limit=50",
        response: json({ error: "history failure" }, 500),
        expected: { status: "error", error: { code: "service" } },
      },
    ] as const;

    for (const fatalCase of fatalCases) {
      fetchMock.mockReset();
      fetchMock.mockImplementation((input) => {
        const path = String(input).replace("conv_id=conv_b", "conv_id=conv_a");
        if (path === fatalCase.failingPath) {
          return Promise.resolve(fatalCase.response);
        }
        return successfulReadResponse(path);
      });
      const controller = createChatWorkspaceController({}, {
        loadWorkspace: (input, options) => loadChatWorkspace(input, {
          ...options,
          timeoutMs: 0,
        }),
      });

      await controller.load();

      expect(controller.getState()).toMatchObject(fatalCase.expected);
      controller.dispose();
    }
  });

  it("recovers readiness on an explicit retry without losing selection or history", async () => {
    let readinessCalls = 0;
    fetchMock.mockImplementation((input) => {
      const path = String(input).replace("conv_id=conv_b", "conv_id=conv_a");
      if (path === "/api/chat/readiness?conv_id=conv_a") {
        readinessCalls += 1;
        return Promise.resolve(readinessCalls === 1
          ? json({ error: "not deployed" }, 404)
          : json(readinessDto("ready", "conversation-model")));
      }
      return successfulReadResponse(path);
    });
    const controller = createChatWorkspaceController(
      { preferredConversationId: "conv_b" },
      {
        loadWorkspace: (input, options) => loadChatWorkspace(input, {
          ...options,
          timeoutMs: 0,
        }),
      },
    );

    await controller.load();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: {
        selectedConversationId: "conv_b",
        setup: { readiness: { kind: "unavailable", reason: "not-found" } },
        history: { conversationId: "conv_b" },
      },
    });

    await controller.retry();

    expect(controller.getState()).toMatchObject({
      status: "ready",
      workspace: {
        selectedConversationId: "conv_b",
        setup: {
          readiness: { kind: "available", value: { ready: true } },
        },
        history: { conversationId: "conv_b" },
      },
    });
    expect(readinessCalls).toBe(2);
    expect(requestPaths().join(" ")).not.toMatch(
      /send|regenerate|reconciliation|event-stream|\/ws|websocket|provider/,
    );
    controller.dispose();
  });

  it("surfaces a conversation-list 500 as the original fatal API error", async () => {
    fetchMock.mockImplementation((input) => {
      const path = String(input).replace("conv_id=conv_b", "conv_id=conv_a");
      if (path === "/api/conversations") {
        return Promise.resolve(json({ error: "failed" }, 500));
      }
      return successfulReadResponse(path);
    });

    const error = await loadChatWorkspace({}, { timeoutMs: 0 })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500 });
  });

  function requestPaths(): string[] {
    return fetchMock.mock.calls.map(([input]) => String(input));
  }
});

function successfulReadResponse(path: string): Promise<Response> {
  path = path.replace("conv_id=conv_b", "conv_id=conv_a");
  if (path === "/api/main/configuration?conv_id=conv_a") return Promise.resolve(json(mainConfigurationWire("conversation-model")));
  if (path === "/api/chat/readiness?conv_id=conv_a") {
    return Promise.resolve(json(readinessDto("ready", "conversation-model")));
  }
  if (path === "/api/conversations") {
    return Promise.resolve(json(conversationDtos()));
  }
  const match = path.match(/^\/api\/conversations\/(conv_[ab])\/messages\/window\?limit=50$/);
  if (match) {
    return Promise.resolve(json([messageDto(match[1]!, `history-${match[1]}`)]));
  }
  return Promise.resolve(json({ error: "unexpected request" }, 500));
}

function readinessDto(
  reason: "ready" | "provider_not_configured",
  modelKey: string,
) {
  return {
    ready: reason === "ready",
    model_key: modelKey,
    reason_code: reason,
    setup_action_required: reason !== "ready",
  };
}

function conversationDtos() {
  return [
    {
      id: "conv_a",
      title: "Conversation A",
      model: "conversation-model",
      created_at: 1,
      updated_at: 3,
      message_count: 1,
    },
    {
      id: "conv_b",
      title: "Conversation B",
      model: "conversation-model",
      created_at: 2,
      updated_at: 4,
      message_count: 1,
    },
  ];
}

function messageDto(conversationId: string, content: string) {
  return {
    id: `message-${conversationId}`,
    conv_id: conversationId,
    role: "assistant",
    content,
    created_at: 10,
    simple_think: null,
    is_carryover: 0,
    attachments: [],
    thinking: null,
    mcp_tool_calls: [],
    cache_region: null,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(Array.isArray(payload) && payload[0]?.conv_id ? messageWindowWire(payload, payload[0].conv_id) : payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
