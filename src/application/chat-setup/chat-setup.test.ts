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
  RuntimeContractError,
  type AvailableModel,
  type ChatReadiness,
} from "@/domain/runtime";
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
    const bootstrapError = captureError(() => createChatSetupViewModel({
      conversation: null,
      availableModels: models(),
      readiness: incompleteBootstrapReadiness,
    }));
    const conversationError = captureError(() => createChatSetupViewModel({
      conversation: { ...conversation(), modelKey: undefined, secret: fakeSecret } as unknown as Conversation,
      availableModels: models(),
      readiness: readiness(),
    }));
    const inputError = captureError(() => createChatSetupViewModel(
      undefined as unknown as Parameters<typeof createChatSetupViewModel>[0],
    ));

    for (const error of [bootstrapError, conversationError, inputError]) {
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
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("passes the conversation model to readiness and only calls Runtime Domain endpoints", async () => {
    fetchMock.mockImplementation((input) => {
      const path = String(input);
      return Promise.resolve(path === "/api/models"
        ? json(modelDtos())
        : json(readinessDto("ready", "model/key + one")));
    });
    const caller = new AbortController();

    const result = await loadChatSetupForConversation(
      conversation({ modelKey: "model/key + one" }),
      { signal: caller.signal, timeoutMs: 0, headers: { "x-chat-setup": "test" } },
    );

    expect(result.modelKey).toBe("model/key + one");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([path]) => String(path))).toEqual([
      "/api/models",
      "/api/chat/readiness?model=model%2Fkey+%2B+one",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method).toBe("GET");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get("x-chat-setup")).toBe("test");
    }

    const paths = fetchMock.mock.calls.map(([path]) => String(path)).join(" ");
    expect(paths).not.toMatch(/conversations|messages|settings|provider/);
  });

  it("omits the bootstrap readiness model query and trusts its response model", async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(
      String(input) === "/api/models"
        ? json(modelDtos())
        : json(readinessDto("ready", "model-c")),
    ));

    const result = await loadBootstrapChatSetup({ timeoutMs: 0 });

    expect(fetchMock.mock.calls.map(([path]) => String(path))).toEqual([
      "/api/models",
      "/api/chat/readiness",
    ]);
    expect(result.modelKey).toBe("model-c");
    expect(result.models.map((model) => model.selected)).toEqual([false, false, true]);
  });

  it("degrades a missing bootstrap readiness route without inventing a model or ready state", async () => {
    const fakeEndpoint = "https://private-readiness.example";
    fetchMock.mockImplementation((input) => Promise.resolve(
      String(input) === "/api/models"
        ? json(modelDtos())
        : json({ error: "missing", endpoint: fakeEndpoint }, 404),
    ));

    const result = await loadBootstrapChatSetup({ timeoutMs: 0 });

    expect(result).toMatchObject({
      modelKey: null,
      modelLabel: null,
      modelKnown: false,
      status: "readiness-unavailable",
      setupActionRequired: true,
      readiness: { kind: "unavailable", reason: "not-found" },
    });
    expect(result.models.every((model) => model.selected === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(fakeEndpoint);
  });

  it("safely degrades readiness network, timeout, and DTO contract failures", async () => {
    const fakeEndpoint = "https://internal-provider.example";
    const readinessFailures: ReadonlyArray<{
      readonly expectedReason: "network" | "timeout" | "contract";
      readonly timeoutMs: number;
      readonly readinessResponse: (signal?: AbortSignal | null) => Promise<Response>;
    }> = [
      {
        expectedReason: "network",
        timeoutMs: 0,
        readinessResponse: () => Promise.reject(new TypeError(fakeEndpoint)),
      },
      {
        expectedReason: "timeout",
        timeoutMs: 1,
        readinessResponse: (signal) => new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      },
      {
        expectedReason: "contract",
        timeoutMs: 0,
        readinessResponse: () => Promise.resolve(json({
          ...readinessDto("ready", "model-b"),
          ready: "yes",
          endpoint: fakeEndpoint,
        })),
      },
    ];

    for (const failure of readinessFailures) {
      fetchMock.mockReset();
      fetchMock.mockImplementation((input, init) =>
        String(input) === "/api/models"
          ? Promise.resolve(json(modelDtos()))
          : failure.readinessResponse(init?.signal),
      );

      const result = await loadBootstrapChatSetup({
        timeoutMs: failure.timeoutMs,
      });

      expect(result.readiness).toEqual({
        kind: "unavailable",
        reason: failure.expectedReason,
      });
      expect(result.status).toBe("readiness-unavailable");
      expect(JSON.stringify(result)).not.toContain(fakeEndpoint);
    }
  });

  it("keeps readiness authentication failures fatal", async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(
      String(input) === "/api/models"
        ? json(modelDtos())
        : json({ error: "unauthenticated" }, 401),
    ));

    const error = await loadBootstrapChatSetup({ timeoutMs: 0 })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
  });

  it("starts models and readiness concurrently", async () => {
    const modelsResponse = deferred<Response>();
    const readinessResponse = deferred<Response>();
    fetchMock.mockImplementation((input) =>
      String(input) === "/api/models"
        ? modelsResponse.promise
        : readinessResponse.promise,
    );

    const pending = loadChatSetupForConversation(conversation(), { timeoutMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    modelsResponse.resolve(json(modelDtos()));
    readinessResponse.resolve(json(readinessDto("ready", "model-b")));
    await expect(pending).resolves.toMatchObject({ modelKey: "model-b" });
  });

  it("supports caller AbortSignal through both Runtime Domain requests", async () => {
    fetchMock.mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const caller = new AbortController();

    const pending = loadBootstrapChatSetup({ signal: caller.signal, timeoutMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    caller.abort("stop setup");

    const error = await pending.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "ABORTED" });
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
  });

  it("preserves ApiError without wrapping it as an application error", async () => {
    fetchMock.mockImplementation((input) => Promise.resolve(
      String(input) === "/api/models"
        ? json({ error: "service unavailable" }, 503)
        : json(readinessDto("ready", "model-b")),
    ));

    const error = await loadChatSetupForConversation(
      conversation(),
      { timeoutMs: 0 },
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ChatSetupContractError);
    expect(error).toMatchObject({ status: 503, code: "HTTP_ERROR" });
  });

  it("preserves RuntimeContractError without generating a fake setup state", async () => {
    const fakeSecret = "fake-runtime-contract-secret";
    fetchMock.mockImplementation((input) => Promise.resolve(
      String(input) === "/api/models"
        ? json({ invalid: true, secret: fakeSecret })
        : json(readinessDto("ready", "model-b")),
    ));

    const error = await loadChatSetupForConversation(
      conversation(),
      { timeoutMs: 0 },
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(RuntimeContractError);
    expect(error).not.toBeInstanceOf(ChatSetupContractError);
    expect(String(error)).not.toContain(fakeSecret);
  });

  it("rejects missing conversation data before making any domain calls", async () => {
    const fakeSecret = "fake-service-input-secret";
    const error = await loadChatSetupForConversation(
      {
        ...conversation(),
        modelKey: undefined,
        secret: fakeSecret,
      } as unknown as Conversation,
      { timeoutMs: 0 },
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ChatSetupContractError);
    expect(String(error)).not.toContain(fakeSecret);
    expect(fetchMock).not.toHaveBeenCalled();
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

function modelDtos() {
  return [
    { key: "model-a", provider: "provider-a" },
    { key: "model-b", provider: "provider-b" },
    { key: "model-c", provider: "provider-c" },
  ];
}

function readinessDto(
  reason: "ready" | "unknown_model" | "provider_not_configured" | "configuration_invalid",
  modelKey: string,
) {
  return {
    ready: reason === "ready",
    model_key: modelKey,
    reason_code: reason,
    setup_action_required: reason !== "ready",
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
