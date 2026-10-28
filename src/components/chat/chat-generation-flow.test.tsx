import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatSendController, createRegeneratePersistenceProjection } from "@/application/chat-send";
import { openRegenerateExecution } from "@/application/chat-execution";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { Bubble } from "./Bubble";

afterEach(() => vi.unstubAllGlobals());

function wireStream() {
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { writer = controller; } });
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }));
  // PR7-B may drain diagnostics asynchronously; it is not a generation retry.
  vi.stubGlobal("fetch", (url: RequestInfo | URL, options?: RequestInit) => String(url).includes("/api/chat/debug/drain")
    ? Promise.resolve(new Response("{}", { status: 403 })) : fetch(url, options));
  return {
    fetch,
    emit: (payload: object, event?: string) => writer.enqueue(new TextEncoder().encode(
      `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(payload)}\n\n`,
    )),
    close: () => writer.close(),
  };
}
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Synthetic Chat did not reach the expected state");
}

describe("Main wire → controller → UI generation states", () => {
  it.each(["send", "regenerate"] as const)("keeps %s Thinking/DRIFT consistent through A/B selection and HTTP recovery", async kind => {
    const wire = wireStream();
    const original = mapMessage(messageWire({ content: "old", thinking: null, drift: null }));
    const saved = mapMessage(messageWire({ content: "body", thinking: "one\n\ntwo", drift: "authorized drift" }));
    let history = kind === "regenerate" ? [original] : [];
    const controller = createChatSendController({ openRegenerateExecution,
      createUuid: () => "synthetic-thinking",
      reconcileHistory: async () => {
        history = [saved];
        return { persistedMessageIds: [saved.id], regenerateTarget: createRegeneratePersistenceProjection(saved) };
      },
    });
    const visible = (owner = "conv_a") => composeVisibleChatMessages(owner === "conv_a" ? history : [], controller.getState(), owner);
    if (kind === "send") await controller.send({ conversationId: "conv_a", content: "question" });
    else await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: 1 });
    wire.emit({ type: "start", id: saved.id, drift_enabled: true, include_drift: false });
    wire.emit({ type: "chunk", content: "[THINKING_START] one [HEART:SYNTH_PRIVATE][THINKING_END]body[THINKING_START]two[THINKING_END][DRIFT:authorized drift]" });
    await waitFor(() => JSON.stringify(visible()).includes("authorized drift"));
    expect(visible().slice(-1)[0]).toMatchObject({ content: "body", thinking: saved.thinking, simpleThink: saved.simpleThink });
    expect(JSON.stringify(visible())).not.toContain("SYNTH_PRIVATE");
    expect(visible("conv_b")).toEqual([]);
    if (kind === "regenerate") wire.emit({ id: saved.id, content: saved.content, thinking: saved.thinking, drift: saved.simpleThink }, "persisted");
    wire.close(); await waitFor(() => controller.getState().kind === "idle");
    expect(visible()).toEqual(composeVisibleChatMessages([saved], { kind: "idle" }, "conv_a"));
    expect(visible()[0]).toMatchObject({ thinking: "one\n\ntwo", simpleThink: "authorized drift" });
    controller.dispose();
  });

  it("shows waiting, separate Thinking/DRIFT, visible streaming and authoritative send completion", async () => {
    const wire = wireStream();
    let history = [mapMessage(messageWire({ id: "prior", content: "prior reply" }))];
    const controller = createChatSendController({
      createUuid: () => "synthetic-send",
      reconcileHistory: async () => {
        history = [...history,
          mapMessage(messageWire({ id: "saved-user", role: "user", content: "question", thinking: null, drift: null })),
          mapMessage(messageWire({ id: "new-reply", content: "visible body", thinking: "separate thinking", drift: "separate drift" })),
        ];
        return { persistedMessageIds: history.map(({ id }) => id), regenerateTarget: null };
      },
    });
    const messages = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    const html = () => renderToStaticMarkup(<>{messages().map((message) => <Bubble key={message.id} message={message} />)}</>);
    expect(await controller.send({ conversationId: "conv_a", content: "question" })).toBe(true);
    expect(html()).toContain("思考中");
    const overlayId = messages().slice(-1)[0]?.id;
    wire.emit({ type: "start", id: "new-reply", drift_enabled: true });
    wire.emit({ type: "chunk", content: "[THINKING_START]separate thinking[THINKING_END][DRIFT:separate drift][HEART:private][TODO:private]" });
    await waitFor(() => JSON.stringify(messages()).includes("separate drift"));
    expect(html()).toContain("思考中"); expect(JSON.stringify(messages())).not.toMatch(/private|THINKING_START|HEART|TODO:/);
    wire.emit({ type: "chunk", content: "visible body" });
    await waitFor(() => html().includes("visible body"));
    expect(messages().slice(-1)[0]?.id).toBe(overlayId); expect(html()).not.toContain("chat-generation");
    wire.close(); await waitFor(() => controller.getState().kind === "idle");
    expect(messages().map(({ id }) => id)).toEqual(["prior", "saved-user", "new-reply"]);
    expect(html()).not.toContain("chat-generation"); expect(html()).toContain("复制");
    expect(wire.fetch).toHaveBeenCalledOnce(); expect(wire.fetch.mock.calls[0]?.[0]).toBe("/api/conversations/conv_a/send");
    controller.dispose();
  });

  it.each(["success", "failure", "unknown"] as const)("keeps canonical target identity through %s and never retries generation during recovery", async (outcome) => {
    const wire = wireStream();
    const original = mapMessage(messageWire({ content: "original persisted body", thinking: null, drift: null }));
    const committed = mapMessage(messageWire({ content: "replacement body", thinking: null, drift: null }));
    let history = [original], readable = outcome !== "unknown";
    const controller = createChatSendController({
      openRegenerateExecution,
      createUuid: () => `synthetic-${outcome}`,
      reconcileHistory: async () => {
        if (!readable) throw new Error("synthetic HTTP unavailable");
        history = [outcome === "success" ? committed : original];
        return { persistedMessageIds: [original.id], regenerateTarget: createRegeneratePersistenceProjection(history[0]) };
      },
    });
    const messages = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    const html = () => renderToStaticMarkup(<Bubble message={messages()[0]} />);
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
    expect(messages()).toHaveLength(1); expect(messages()[0].id).toBe(original.id);
    expect(html()).toContain("思考中"); expect(html()).not.toContain("original persisted body");
    wire.emit({ type: "start", id: original.id, drift_enabled: false, include_drift: true });
    wire.emit({ type: "chunk", content: "replacement body[DRIFT:SYNTH_PRIVATE][THINKING_START]safe[HEART:SYNTH_PRIVATE][THINKING_END]" });
    await waitFor(() => html().includes("replacement body")); expect(html()).not.toContain("chat-generation");
    expect(JSON.stringify(messages())).not.toMatch(/SYNTH_PRIVATE|HEART:|DRIFT:/);
    if (outcome === "success") wire.emit({ id: original.id, content: committed.content, thinking: null, drift: null }, "persisted");
    if (outcome === "failure") wire.emit({ type: "error", id: original.id, code: "provider_execution_failed" });
    wire.close();
    await waitFor(() => controller.getState().kind === (outcome === "success" ? "idle" : outcome === "failure" ? "error" : "regenerate-finalization-uncertain"));
    expect(JSON.stringify(messages())).not.toContain("SYNTH_PRIVATE");
    expect(messages()).toHaveLength(outcome === "failure" ? 2 : 1); expect(messages()[0].id).toBe(original.id);
    expect(original.content).toBe("original persisted body");
    if (outcome === "success") {
      expect(messages()[0].content).toBe(committed.content); expect(html()).not.toContain("chat-generation");
    } else if (outcome === "failure") {
      expect(messages()[0].content).toBe(original.content); expect(html()).not.toContain("chat-generation");
      expect(messages()[1]).toMatchObject({ content: "replacement body", executionStatus: "unconfirmed" });
    } else {
      expect(html()).toContain("结果待确认"); expect(messages()[0].content).toBe("replacement body");
      readable = true; await controller.retryFinalization();
      expect(controller.getState()).toMatchObject({ kind: "regenerate-finalization-uncertain", recoveryReadSucceeded: true });
      expect(messages()[0].content).toBe(original.content); // PR1 read-only recovery displays HTTP authority.
    }
    expect(wire.fetch).toHaveBeenCalledOnce();
    expect(wire.fetch.mock.calls[0]?.[0]).toBe(`/api/conversations/conv_a/messages/${original.id}/regenerate`);
    controller.dispose();
  });
});
