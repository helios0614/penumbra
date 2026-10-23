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
  vi.stubGlobal("fetch", fetch);
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
    expect(html()).toContain("正在生成");
    const overlayId = messages().slice(-1)[0]?.id;
    wire.emit({ type: "start", id: "new-reply" });
    wire.emit({ type: "chunk", content: "[THINKING_START]separate thinking[THINKING_END][DRIFT:separate drift][HEART:private][TODO:private]" });
    await waitFor(() => JSON.stringify(messages()).includes("separate drift"));
    expect(html()).toContain("正在生成"); expect(JSON.stringify(messages())).not.toMatch(/private|THINKING_START|HEART|TODO:/);
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
    expect(html()).toContain("正在生成"); expect(html()).not.toContain("original persisted body");
    wire.emit({ type: "start", id: original.id });
    wire.emit({ type: "chunk", content: "replacement body" });
    await waitFor(() => html().includes("replacement body")); expect(html()).not.toContain("chat-generation");
    if (outcome === "success") wire.emit({ id: original.id, content: committed.content, thinking: null, drift: null }, "persisted");
    if (outcome === "failure") wire.emit({ type: "error", id: original.id, code: "provider_execution_failed" });
    wire.close();
    await waitFor(() => controller.getState().kind === (outcome === "success" ? "idle" : outcome === "failure" ? "error" : "regenerate-finalization-uncertain"));
    expect(messages()).toHaveLength(1); expect(messages()[0].id).toBe(original.id);
    expect(original.content).toBe("original persisted body");
    if (outcome === "success") {
      expect(messages()[0].content).toBe(committed.content); expect(html()).not.toContain("chat-generation");
    } else if (outcome === "failure") {
      expect(messages()[0].content).toBe(original.content); expect(html()).not.toContain("chat-generation");
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
