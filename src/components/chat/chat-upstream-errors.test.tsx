import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { createChatSendController, createRegeneratePersistenceProjection } from "@/application/chat-send";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { Bubble } from "./Bubble";
import { mapChatExecutionEvent } from "@/application/chat-execution";
import { safeHttpErrorContent } from "@/domain/message/assistant-failure";

afterEach(() => vi.unstubAllGlobals());
const reasons = ["Adaptive thinking is disabled by this workspace policy.", "This region is not enabled for the requested deployment."];
const marker = (reason: string) => `[Anthropic API 错误 403] provider_request_failed\n上游类型：permission_error\n上游信息：${reason}\n请求 ID：req-synthetic`;
const render = (messages: ReturnType<typeof mapMessage>[], state: Parameters<typeof composeVisibleChatMessages>[1]) =>
  renderToStaticMarkup(<>{composeVisibleChatMessages(messages, state, "conv_a").map(message => <Bubble key={message.id} message={message} />)}</>);

it.each(["send", "append", "regenerate"])("%s keeps different real reasons for the same Provider, HTTP 403 and error type", async kind => {
  const outputs: string[] = [];
  for (const reason of reasons) {
    let history = [mapMessage(messageWire({ id: "target", content: "已保存正文", thinking: null, drift: null }))];
    const content = marker(reason);
    if (kind === "append") {
      history.push(mapMessage(messageWire({ id: "tool-result", role: "system", content: "工具执行成功", thinking: null, drift: null })),
        mapMessage(messageWire({ id: "failed", content, thinking: null, drift: null })));
      outputs.push(render(history, { kind: "idle" }));
      continue;
    }
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (kind === "send") history = [mapMessage(messageWire({ id: "failed", content, thinking: null, drift: null }))];
      const id = kind === "send" ? "failed" : "target";
      return new Response(`data: ${JSON.stringify({ type: "start", id })}\n\ndata: ${JSON.stringify({ type: "chunk", content })}\n\n` +
        (kind === "regenerate" ? `data: ${JSON.stringify({ type: "error", id, code: "provider_request_failed" })}\n\n` : ""),
        { headers: { "content-type": "text/event-stream" } });
    }));
    const controller = createChatSendController({ createUuid: () => "reason", reconcileHistory: async () => ({
      persistedMessageIds: history.map(m => m.id), regenerateTarget: createRegeneratePersistenceProjection(history[0]),
    }) });
    if (kind === "send") await controller.send({ conversationId: "conv_a", content: "合成问题" });
    else await controller.regenerate({ conversationId: "conv_a", targetMessageId: "target", targetCreatedAt: history[0].createdAt });
    await vi.waitFor(() => expect(controller.getState().kind).toBe("error"));
    outputs.push(render(history, controller.getState())); controller.dispose();
  }
  reasons.forEach((reason, index) => {
    expect(outputs[index]).toContain(reason);
    expect(outputs[index]).not.toContain(reasons[1 - index]);
    expect(outputs[index]).not.toMatch(/鉴权失败|检查 API Key|访问权限/);
  });
});

it("faithfully keeps a generic upstream message and unlabelled safe legacy error text", () => {
  const generic = render([mapMessage(messageWire({ content: marker("Request failed.") }))], { kind: "idle" });
  expect(generic).toContain("Request failed."); expect(generic).not.toMatch(/鉴权失败|检查 API Key/);
  const legacy = render([mapMessage(messageWire({ content: "[错误] The requested model does not accept image inputs." }))], { kind: "idle" });
  expect(legacy).toContain("The requested model does not accept image inputs.");
});

it("keeps different safe HTTP error bodies in their unconfirmed Assistant without inferring a cause", async () => {
  for (const reason of reasons) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { type: "permission_error", message: reason } }), { status: 403, headers: { "content-type": "application/json" } })));
    const controller = createChatSendController({ createUuid: () => "http-error", reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
    await controller.send({ conversationId: "conv_a", content: "问题" });
    await vi.waitFor(() => expect(controller.getState().kind).toBe("error"));
    expect(render([], controller.getState())).toContain(reason);
    expect(JSON.stringify(controller.getState())).not.toContain("重新登录");
    controller.dispose();
  }
});

it("keeps useful framed SSE debug/error text instead of reducing it to the failure code", () => {
  for (const reason of reasons) {
    for (const payload of [
      { type: "error", id: "target", code: "provider_request_failed", error_text: marker(reason) },
      { type: "debug", msg_id: "target", has_error: true, error_code: "provider_request_failed", error_text: marker(reason) },
    ]) {
      const event = mapChatExecutionEvent(payload);
      expect(JSON.stringify(event)).toContain(reason);
      expect(JSON.stringify(event)).not.toContain("鉴权失败");
    }
  }
});

it("keeps a safe diagnostic URL without dropping the reason, but rejects credentials", () => {
  const reason = "Feature disabled. See https://docs.synthetic.invalid/errors for details.";
  expect(safeHttpErrorContent({ error: { message: reason } })).toBe(reason);
  expect(safeHttpErrorContent({ error: { message: "See https://user:private@synthetic.invalid" } })).toBeNull();
  expect(safeHttpErrorContent({ error: { message: "See https://synthetic.invalid/?api%5Fkey=private" } })).toBeNull();
});
