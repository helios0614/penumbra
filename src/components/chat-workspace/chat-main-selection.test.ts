import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatWorkspaceController } from "./chat-workspace-controller";
import { getChatSenderAvailability } from "./chat-sender-policy";
import { updateConversation } from "@/domain/conversation";
import { mainConfigurationWire, messageWire, messageWithoutDriftWire, OPENAI, readinessWire } from "@/test-fixtures/main-chat-wire";

afterEach(() => vi.unstubAllGlobals());

describe("Main selection mutation and request ownership", () => {
  it("opens the workspace when all reads return 200 and empty HTTP drift is omitted", async () => {
    syntheticServer((path) => path === "/api/conversations/conv_a/messages?limit=50&public_view=true"
      ? Promise.resolve(json([messageWithoutDriftWire({ content: "visible synthetic history" })])) : null);
    const controller = createChatWorkspaceController();
    await controller.load();
    expect(controller.getState()).toMatchObject({ status: "ready", workspace: {
      selectedConversationId: "conv_a", history: { messages: [{ content: "visible synthetic history", simpleThink: null }] },
    } });
    controller.dispose();
  });
  it("PUTs canonical identity and rereads configuration/readiness/summary despite an unchanged legacy model", async () => {
    const wire = syntheticServer();
    const controller = createChatWorkspaceController();
    await controller.load();
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(true);
    await controller.saveMainSelection("conv_a", { connectionId: "connection-a", protocol: OPENAI, model: "changed-literal" });
    expect(wire.putBodies).toEqual([{ main_selection: { connection_id: "connection-a", protocol: OPENAI, model: "changed-literal" } }]);
    expect(controller.getState()).toMatchObject({ workspace: { selectedConversation: { modelKey: "unchanged-legacy" },
      setup: { modelKey: "changed-literal", configuration: { selection: { model: "changed-literal" } }, readiness: { kind: "available", value: { modelKey: "changed-literal" } } } } });
    expect(wire.paths.filter((path) => path === "/api/conversations")).toHaveLength(2);
    expect(wire.paths.filter((path) => path.includes("configuration?conv_id=conv_a"))).toHaveLength(2);
    expect(wire.paths.filter((path) => path.includes("readiness?conv_id=conv_a"))).toHaveLength(2);
    expect(wire.paths.join(" ")).not.toMatch(/api\/models|readiness\?model=/);
    controller.dispose();
  });

  it("invalidates effective selection after WS list refresh even if legacy model is unchanged", async () => {
    const server = syntheticServer();
    const controller = createChatWorkspaceController();
    await controller.load();
    server.models.conv_a = "external-literal";
    await controller.refreshConversationList();
    expect(controller.getState()).toMatchObject({ workspace: { setup: { modelKey: "external-literal" } } });
    controller.dispose();
  });

  it("does not let slow A model readback overwrite selected B or B history", async () => {
    const delayed = deferred<Response>();
    let delayA = false;
    const server = syntheticServer((path) => delayA && path === "/api/main/configuration?conv_id=conv_a" ? delayed.promise : null);
    const controller = createChatWorkspaceController();
    await controller.load();
    delayA = true;
    const refreshA = controller.refreshConversationList().catch(() => undefined);
    await waitFor(() => server.paths.filter((path) => path === "/api/main/configuration?conv_id=conv_a").length === 2);
    await controller.selectConversation("conv_b");
    delayed.resolve(json(mainConfigurationWire("stale-a")));
    await refreshA;
    expect(controller.getState()).toMatchObject({ workspace: { selectedConversationId: "conv_b", setup: { modelKey: "literal-b" }, history: { conversationId: "conv_b", messages: [{ content: "history conv_b" }] } } });
    controller.dispose();
  });

  it("does not let a late A PUT response or its old editor save into B", async () => {
    const delayed = deferred<Response>();
    const server = syntheticServer((path, init) => init?.method === "PUT" && path.endsWith("conv_a") ? delayed.promise : null);
    const controller = createChatWorkspaceController();
    await controller.load();
    const pending = controller.saveMainSelection("conv_a", { connectionId: "connection-a", protocol: OPENAI, model: "new-a" });
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(false);
    await controller.selectConversation("conv_b");
    delayed.resolve(json({ ok: true }));
    await pending;
    expect(controller.getState()).toMatchObject({ workspace: { selectedConversationId: "conv_b", setup: { modelKey: "literal-b" } } });
    await expect(controller.saveMainSelection("conv_a", { connectionId: "connection-a", protocol: OPENAI, model: "stale-editor" })).rejects.toThrow();
    expect(server.paths.filter((path) => path === "/api/conversations/conv_b")).toHaveLength(0);
    controller.dispose();
  });

  it("keeps history and blocks sending if PUT readback is unconfirmed, with no automatic second PUT", async () => {
    const server = syntheticServer((_path, init) => init?.method === "PUT" ? Promise.resolve(json({ detail: "private" }, 503)) : null);
    const controller = createChatWorkspaceController();
    await controller.load();
    await expect(controller.saveMainSelection("conv_a", { connectionId: "connection-a", protocol: OPENAI, model: "new" })).rejects.toThrow();
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(false);
    expect(controller.getState()).toMatchObject({ workspace: { history: { messages: [{ content: "history conv_a" }] } } });
    await controller.refreshConversationList();
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(true);
    expect(server.paths.filter((path) => path === "/api/conversations/conv_a")).toHaveLength(1);
    controller.dispose();
  });

  it("keeps A blocked if switching to B fails after aborting A's in-flight PUT", async () => {
    const delayed = deferred<Response>();
    syntheticServer((path, init) => {
      if (init?.method === "PUT") return delayed.promise;
      if (path.startsWith("/api/conversations/conv_b/messages")) return Promise.resolve(json({}, 503));
      return null;
    });
    const controller = createChatWorkspaceController();
    await controller.load();
    const pending = controller.saveMainSelection("conv_a", { connectionId: "connection-a", protocol: OPENAI, model: "unknown-a" });
    await controller.selectConversation("conv_b");
    delayed.resolve(json({ ok: true }));
    await pending;
    expect(controller.getState()).toMatchObject({ workspace: { selectedConversationId: "conv_a", setup: { readiness: { kind: "unavailable" } } } });
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(false);
    controller.dispose();
  });

  it("refuses conflicting legacy and canonical mutation fields before transport", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(updateConversation("conv_a", { modelKey: "old", mainSelection: { connectionId: "new", protocol: OPENAI, model: "literal" } })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains a successfully saved identity if its following readiness read fails", async () => {
    let readinessReads = 0;
    const server = syntheticServer((path) => {
      if (path === "/api/chat/readiness?conv_id=conv_a" && ++readinessReads === 2) return Promise.resolve(json({}, 503));
      return null;
    });
    const controller = createChatWorkspaceController();
    await controller.load();
    await expect(controller.saveMainSelection("conv_a", { connectionId: "connection-a", protocol: OPENAI, model: "saved-new" })).rejects.toThrow();
    expect(controller.getState()).toMatchObject({ workspace: { setup: { configuration: { selection: { model: "saved-new" } }, readiness: { kind: "unavailable" } } } });
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(false);
    await controller.refreshConversationList();
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(true);
    expect(server.putBodies).toHaveLength(1);
    controller.dispose();
  });
});

function syntheticServer(intercept?: (path: string, init?: RequestInit) => Promise<Response> | null) {
  const paths: string[] = [], putBodies: unknown[] = [];
  const models: Record<string, string> = { conv_a: "literal-a", conv_b: "literal-b" };
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input); paths.push(path);
    const intercepted = intercept?.(path, init);
    if (intercepted) return intercepted;
    if (path === "/api/conversations") return json(["conv_a", "conv_b"].map((id) => ({ id, title: id, model: "unchanged-legacy", main_selection: { connection_id: "connection-a", protocol: OPENAI, model: models[id] }, main_selection_diagnostic: null, created_at: 1, updated_at: 2, message_count: 1 })));
    if (path.startsWith("/api/main/configuration?")) return json(mainConfigurationWire(models[new URL(path, "https://synthetic.invalid").searchParams.get("conv_id")!]));
    if (path.startsWith("/api/chat/readiness?")) return json(readinessWire(models[new URL(path, "https://synthetic.invalid").searchParams.get("conv_id")!]));
    const match = path.match(/^\/api\/conversations\/(conv_[ab])/);
    if (match && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)); putBodies.push(body); models[match[1]] = body.main_selection.model;
      return json({ ok: true });
    }
    if (match && path.includes("/messages")) return json([messageWire({ conv_id: match[1], content: `history ${match[1]}` })]);
    throw new Error(`Unexpected synthetic request ${path}`);
  }));
  return { paths, models, putBodies };
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 0)); }
  throw new Error("Synthetic request did not start");
}
