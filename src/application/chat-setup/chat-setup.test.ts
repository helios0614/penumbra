import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as chatSetup from "@/application/chat-setup";
import {
  ChatSetupContractError,
  createChatSetupViewModel,
  loadBootstrapChatSetup,
  loadChatSetupForConversation,
} from "@/application/chat-setup";
import type { Conversation } from "@/domain/conversation";
import {
  type AvailableModel,
  type ChatReadiness,
} from "@/domain/runtime";
import { mainConfigurationWire, readinessWire } from "@/test-fixtures/main-chat-wire";
import { mapMainConfiguration } from "@/domain/runtime";
import { ApiError } from "@/lib/api";

describe("chat setup view model", () => {
  it("combines a conversation, known model, and ready state into an allowlisted view model", () => {
    const result = createChatSetupViewModel({
      conversation: conversation(),
      availableModels: models(),
      readiness: readiness(),
    });

    expect(result).toEqual({
      conversationId: "conv_1",
      conversationTitle: "Conversation one",
      modelKey: "model-b",
      modelLabel: "Model B",
      modelKnown: true,
      models: [
        { key: "model-a", label: "Model A", provider: "provider-a", selected: false },
        { key: "model-b", label: "Model B", provider: "provider-b", selected: true },
        { key: "model-c", label: "Model C", provider: "provider-c", selected: false },
      ],
      status: "ready",
      setupActionRequired: false,
      readiness: {
        kind: "available",
        value: {
          ready: true,
          modelKey: "model-b",
          reason: "ready",
          setupActionRequired: false,
        },
      },
    });
  });

  it.each([
    ["provider-not-configured", true],
    ["configuration-invalid", true],
  ] as const)("maps %s as a legal business state", (reason, setupActionRequired) => {
    const result = createChatSetupViewModel({
      conversation: conversation(),
      availableModels: models(),
      readiness: readiness({
        ready: false,
        reason,
        setupActionRequired,
      }),
    });

    expect(result.status).toBe(reason);
    expect(result.setupActionRequired).toBe(setupActionRequired);
    expect(result.readiness).toEqual({
      kind: "available",
      value: {
        ready: false,
        modelKey: "model-b",
        reason,
        setupActionRequired,
      },
    });
  });

  it("projects generation-not-supported only into the Chat setup boundary", () => {
    const result = createChatSetupViewModel({
      conversation: conversation(),
      availableModels: models(),
      readiness: readiness({
        ready: false,
        reason: "configuration-invalid",
        setupActionRequired: true,
        generationUnsupported: true,
      }),
    });

    expect(result).toMatchObject({
      status: "generation-not-supported",
      readiness: {
        kind: "available",
        value: { reason: "generation-not-supported", ready: false },
      },
    });
  });

  it("preserves an unknown historical conversation model without selecting a replacement", () => {
    const result = createChatSetupViewModel({
      conversation: conversation({ modelKey: "historical-model" }),
      availableModels: models(),
      readiness: readiness({
        ready: false,
        modelKey: "historical-model",
        reason: "unknown-model",
        setupActionRequired: true,
      }),
    });

    expect(result).toMatchObject({
      modelKey: "historical-model",
      modelLabel: "historical-model",
      modelKnown: false,
      status: "unknown-model",
      setupActionRequired: true,
    });
    expect(result.models.every((model) => model.selected === false)).toBe(true);
  });

  it("preserves an explicit empty conversation model as an unknown model", () => {
    const result = createChatSetupViewModel({
      conversation: conversation({ modelKey: "" }),
      availableModels: models(),
      readiness: readiness({
        ready: false,
        modelKey: "",
        reason: "unknown-model",
        setupActionRequired: true,
      }),
    });

    expect(result).toMatchObject({
      modelKey: "",
      modelLabel: "",
      modelKnown: false,
      status: "unknown-model",
    });
    expect(result.models.every((model) => !model.selected)).toBe(true);
  });

  it("accepts an empty available model list and keeps the current model visible", () => {
    const result = createChatSetupViewModel({
      conversation: conversation(),
      availableModels: [],
      readiness: readiness(),
    });

    expect(result.models).toEqual([]);
    expect(result.modelKnown).toBe(false);
    expect(result.modelLabel).toBe("model-b");
  });

  it("keeps Runtime Domain order and marks every matching key without sorting or deduplicating", () => {
    const availableModels: AvailableModel[] = [
      { key: "model-b", label: "First B", provider: "provider-1" },
      { key: "model-a", label: "Model A", provider: "provider-a" },
      { key: "model-b", label: "Second B", provider: "provider-2" },
    ];

    const result = createChatSetupViewModel({
      conversation: conversation(),
      availableModels,
      readiness: readiness(),
    });

    expect(result.models.map((model) => model.key)).toEqual([
      "model-b",
      "model-a",
      "model-b",
    ]);
    expect(result.models.map((model) => model.selected)).toEqual([true, false, true]);
    expect(result.modelLabel).toBe("First B");
  });

  it("takes the bootstrap model from readiness instead of the first available model", () => {
    const result = createChatSetupViewModel({
      conversation: null,
      availableModels: models(),
      readiness: readiness({ modelKey: "model-c" }),
    });

    expect(result).toMatchObject({
      conversationId: null,
      conversationTitle: null,
      modelKey: "model-c",
      modelLabel: "Model C",
      modelKnown: true,
    });
    expect(result.models.map((model) => model.selected)).toEqual([false, false, true]);
  });

  it("returns a legal unknown-model bootstrap view when the backend default is absent from models", () => {
    const result = createChatSetupViewModel({
      conversation: null,
      availableModels: models(),
      readiness: readiness({
        ready: false,
        modelKey: "backend-default-not-listed",
        reason: "unknown-model",
        setupActionRequired: true,
      }),
    });

    expect(result).toMatchObject({
      conversationId: null,
      conversationTitle: null,
      modelKey: "backend-default-not-listed",
      modelLabel: "backend-default-not-listed",
      modelKnown: false,
      status: "unknown-model",
    });
    expect(result.models.every((model) => !model.selected)).toBe(true);
  });

  it("rejects a conversation/readiness model mismatch without exposing inputs", () => {
    const fakeSecret = "fake-mismatch-secret";
    const unsafeReadiness = {
      ...readiness({ modelKey: "different-model" }),
      secret: fakeSecret,
      raw: { endpoint: "https://private.example" },
    };

    const error = captureError(() => createChatSetupViewModel({
      conversation: { ...conversation(), secret: fakeSecret } as Conversation,
      availableModels: models(),
      readiness: unsafeReadiness,
      configuration: mapMainConfiguration(mainConfigurationWire("model-b")),
    }));

    expect(error).toBeInstanceOf(ChatSetupContractError);
    expect(String(error)).not.toContain(fakeSecret);
    expect(String(error)).not.toContain("private.example");
    expect(String(error)).not.toContain("different-model");
  });

  it("rejects missing bootstrap or conversation domain data with safe application errors", () => {
    const fakeSecret = "fake-missing-data-secret";
    const incompleteBootstrapReadiness = {
      ...readiness({
        ready: false,
        modelKey: "",
        reason: "unknown-model",
        setupActionRequired: true,
      }),
      secret: fakeSecret,
    };
    const bootstrap = createChatSetupViewModel({
      conversation: null,
      availableModels: models(),
      readiness: incompleteBootstrapReadiness,
    });
    expect(bootstrap.modelKey).toBe("");
    const conversationError = captureError(() => createChatSetupViewModel({
      conversation: { ...conversation(), modelKey: undefined, secret: fakeSecret } as unknown as Conversation,
      availableModels: models(),
      readiness: readiness(),
    }));
    const inputError = captureError(() => createChatSetupViewModel(
      undefined as unknown as Parameters<typeof createChatSetupViewModel>[0],
    ));

    for (const error of [conversationError, inputError]) {
      expect(error).toBeInstanceOf(ChatSetupContractError);
      expect(String(error)).not.toContain(fakeSecret);
    }
  });

  it("copies only allowed fields and retains no raw domain object references", () => {
    const fakeSecret = "fake-view-model-secret";
    const fakeEndpoint = "https://fake-endpoint.example/v1";
    const unsafeConversation = {
      ...conversation(),
      secret: fakeSecret,
      activeConfig: { endpoint: fakeEndpoint },
    };
    const unsafeModels = models().map((model) => ({
      ...model,
      secret: fakeSecret,
      endpoint: fakeEndpoint,
      config: { nested: true },
    }));
    const unsafeReadiness = {
      ...readiness(),
      secret: fakeSecret,
      endpoint: fakeEndpoint,
      config: { nested: true },
    };

    const result = createChatSetupViewModel({
      conversation: unsafeConversation,
      availableModels: unsafeModels,
      readiness: unsafeReadiness,
    });
    const serialized = JSON.stringify(result);

    expect(Object.keys(result)).toEqual([
      "conversationId",
      "conversationTitle",
      "modelKey",
      "modelLabel",
      "modelKnown",
      "models",
      "status",
      "setupActionRequired",
      "readiness",
    ]);
    expect(Object.keys(result.readiness)).toEqual(["kind", "value"]);
    expect(result.readiness.kind).toBe("available");
    if (result.readiness.kind === "available") {
      expect(Object.keys(result.readiness.value)).toEqual([
        "ready",
        "modelKey",
        "reason",
        "setupActionRequired",
      ]);
    }
    expect(Object.keys(result.models[0] ?? {})).toEqual([
      "key",
      "label",
      "provider",
      "selected",
    ]);
    expect(result.models[0]).not.toBe(unsafeModels[0]);
    expect(serialized).not.toContain(fakeSecret);
    expect(serialized).not.toContain(fakeEndpoint);
    expect(serialized).not.toContain("activeConfig");
    expect(serialized).not.toContain("config");
  });

  it("exports only application types, errors, composition, and load services", () => {
    expect(Object.keys(chatSetup).sort()).toEqual([
      "ChatSetupContractError",
      "createChatSetupViewModel",
      "loadBootstrapChatSetup",
      "loadChatSetupForConversation",
      "loadChatSetupForConversationWithModels",
    ]);
    expect(chatSetup).not.toHaveProperty("ApiError");
    expect(chatSetup).not.toHaveProperty("apiGet");
    expect(chatSetup).not.toHaveProperty("ChatReadinessDto");
  });
});

describe("chat setup load service", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it("reads conversation-scoped configuration/readiness and ignores legacy model/catalog membership", async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(json(String(input).includes("configuration")
      ? mainConfigurationWire() : readinessWire())));
    const result = await loadChatSetupForConversation(conversation(), { timeoutMs: 0 });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/main/configuration?conv_id=conv_1", "/api/chat/readiness?conv_id=conv_1",
    ]);
    expect(result).toMatchObject({ modelKey: "literal-not-in-catalog", modelKnown: false, readiness: { kind: "available", value: { ready: true } } });
  });

  it("reads the new conversation default without passing a conversation or model query", async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(json(String(input).includes("configuration")
      ? mainConfigurationWire("global-default") : readinessWire("global-default"))));
    const result = await loadBootstrapChatSetup({ timeoutMs: 0 });
    expect(result.modelKey).toBe("global-default");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/main/configuration", "/api/chat/readiness"]);
  });

  it.each(["missing_credential", "disabled_profile", "invalid_main_selection", "ambiguous_legacy_selection", "conversation_not_found", "future_valid_reason"])("preserves %s without losing readable setup", async (code) => {
    fetchMock.mockImplementation((input) => Promise.resolve(json(String(input).includes("configuration")
      ? { ...mainConfigurationWire(), diagnostic: code } : readinessWire("literal-not-in-catalog", code))));
    expect(await loadChatSetupForConversation(conversation(), { timeoutMs: 0 })).toMatchObject({
      configuration: { selection: { connectionId: "connection-a", model: "literal-not-in-catalog" }, diagnostic: code },
      status: code, readiness: { kind: "available", value: { ready: false, reason: code } },
    });
  });

  it.each([404, 503])("keeps setup readable on configuration/readiness HTTP %s", async (status) => {
    fetchMock.mockResolvedValue(json({ detail: "private endpoint/secret" }, status));
    const result = await loadChatSetupForConversation(conversation(), { timeoutMs: 0 });
    expect(result.readiness.kind).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("private endpoint");
  });

  it("blocks a concurrent configuration/readiness mismatch without throwing away history", async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(json(String(input).includes("configuration")
      ? mainConfigurationWire("new") : readinessWire("old"))));
    const result = await loadChatSetupForConversation(conversation(), { timeoutMs: 0 });
    expect(result.readiness.kind).toBe("unavailable");
    expect(result.configuration?.selection?.model).toBe("new");
  });

  it.each([401, 403])("keeps authentication HTTP %s fatal", async (status) => {
    fetchMock.mockResolvedValue(json({}, status));
    await expect(loadBootstrapChatSetup({ timeoutMs: 0 })).rejects.toBeInstanceOf(ApiError);
  });

  it.each([
    ["configuration", "network"], ["readiness", "network"],
    ["configuration", "timeout"], ["readiness", "timeout"],
    ["configuration", "contract"], ["readiness", "contract"],
  ] as const)("degrades %s %s failures without leaking transport or raw DTO details", async (endpoint, failure) => {
    fetchMock.mockImplementation((input, init) => {
      const path = String(input);
      if (path.includes(endpoint)) {
        if (failure === "network") return Promise.reject(new TypeError("private endpoint/secret"));
        if (failure === "contract") return Promise.resolve(json({ raw: "private endpoint/secret" }));
        return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
      }
      return Promise.resolve(json(path.includes("configuration") ? mainConfigurationWire() : readinessWire()));
    });
    const result = await loadChatSetupForConversation(conversation(), { timeoutMs: failure === "timeout" ? 1 : 0 });
    expect(result.readiness).toEqual({ kind: "unavailable", reason: failure });
    expect(JSON.stringify(result)).not.toContain("private endpoint/secret");
    if (endpoint === "readiness") expect(result.configuration?.selection?.model).toBe("literal-not-in-catalog");
  });

  it("passes caller aborts through both reads", async () => {
    fetchMock.mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const caller = new AbortController();
    const pending = loadBootstrapChatSetup({ timeoutMs: 0, signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv_1",
    title: "Conversation one",
    modelKey: "model-b",
    createdAt: 10,
    updatedAt: 20,
    ...overrides,
  };
}

function models(): AvailableModel[] {
  return [
    { key: "model-a", label: "Model A", provider: "provider-a" },
    { key: "model-b", label: "Model B", provider: "provider-b" },
    { key: "model-c", label: "Model C", provider: "provider-c" },
  ];
}

function readiness(overrides: Partial<ChatReadiness> = {}): ChatReadiness {
  return {
    ready: true,
    modelKey: "model-b",
    reason: "ready",
    setupActionRequired: false,
    ...overrides,
  };
}

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected function to throw");
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
