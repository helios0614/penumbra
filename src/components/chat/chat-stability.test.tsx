import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { createChatSendController, createRegeneratePersistenceProjection, type ChatSendState } from "@/application/chat-send";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { Bubble } from "./Bubble";
import { ApiError } from "@/lib/api";
import { toSafeChatExecutionError } from "@/application/chat-send/chat-send-errors";

afterEach(() => vi.unstubAllGlobals());
const failure = "[Anthropic API 错误 524] provider_request_failed\n上游类型：bad_response_status_code\n上游信息：Proxy Read Timeout\n请求 ID：req-synthetic";
async function settled(controller: ReturnType<typeof createChatSendController>) {
  await vi.waitFor(() => expect(["idle", "error", "finalization-uncertain", "regenerate-finalization-uncertain"]).toContain(controller.getState().kind));
}
function html(history: ReturnType<typeof mapMessage>[], state: ChatSendState) {
  return renderToStaticMarkup(<>{composeVisibleChatMessages(history, state, "conv_a").map(message => <Bubble key={message.id} message={message} />)}</>);
}

it("keeps two persisted paragraphs and the safe actual failure after history rereads", () => {
  const history = [mapMessage(messageWire({ content: "第一段。\n\n第二段。\n" + failure }))];
  for (let i = 0; i < 2; i++) {
    const rendered = html(history, { kind: "idle" });
    expect(rendered).toContain("第一段。"); expect(rendered).toContain("第二段。");
    expect(rendered).toContain("Anthropic API，HTTP 524"); expect(rendered).toContain("bad_response_status_code");
    expect(rendered).toContain("Proxy Read Timeout"); expect(rendered).toContain("req-synthetic");
  }
});

it("keeps same-chunk partial body, real error and canonical target through failed send → regenerate", async () => {
  let history: ReturnType<typeof mapMessage>[] = [];
  let generation = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const regenerate = url.includes("/regenerate");
    generation++;
    const content = regenerate ? "恢复成功" : "第一段。\n\n第二段。\n" + failure;
    history = [mapMessage(messageWire({ id: "failed-id", content, thinking: null, drift: null }))];
    const payload = `data: ${JSON.stringify({ type: "start", id: "failed-id" })}\n\ndata: ${JSON.stringify({ type: "chunk", content })}\n\n` +
      (regenerate ? `event: persisted\ndata: ${JSON.stringify({ id: "failed-id", content, thinking: null, drift: null })}\n\n` : "");
    return new Response(payload, { headers: { "content-type": "text/event-stream" } });
  }));
  const controller = createChatSendController({ createUuid: () => "synthetic", reconcileHistory: async () => ({
    persistedMessageIds: history.map(m => m.id), regenerateTarget: history[0] ? createRegeneratePersistenceProjection(history[0]) : null,
  }) });
  await controller.send({ conversationId: "conv_a", content: "合成问题" }); await settled(controller);
  expect(html(history, controller.getState())).toContain("第二段。");
  expect(html(history, controller.getState())).toContain("HTTP 524");
  expect(controller.getState()).toMatchObject({ kind: "error", confirmedFailure: true });
  await controller.regenerate({ conversationId: "conv_a", targetMessageId: "failed-id", targetCreatedAt: history[0].createdAt }); await settled(controller);
  expect(controller.getState().kind).toBe("idle"); expect(generation).toBe(2);
  expect(history[0].id).toBe("failed-id"); expect(html(history, controller.getState())).toContain("恢复成功");
  expect(html(history, controller.getState())).not.toContain("HTTP 524"); controller.dispose();
});

it("shows actual HTTP 524 inside an unconfirmed assistant and keeps regenerate locked", async () => {
  const fetch = vi.fn(async () => new Response("<html>Cookie=synthetic-secret</html>", { status: 524 })); vi.stubGlobal("fetch", fetch);
  const controller = createChatSendController({ createUuid: () => "http", reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null }) });
  await controller.send({ conversationId: "conv_a", content: "问题" }); await settled(controller);
  expect(controller.getState().kind).toBe("finalization-uncertain");
  expect(html([], controller.getState())).toContain("HTTP 524");
  expect(html([], controller.getState())).not.toContain("synthetic-secret");
  expect(await controller.regenerate({ conversationId: "conv_a", targetMessageId: "x", targetCreatedAt: 1 })).toBe(false);
  expect(fetch).toHaveBeenCalledOnce(); controller.dispose();
});

it("rejects unsafe legacy diagnostic lines without leaking private commands", () => {
  const content = "公开正文[THINKING_START]private-thinking[THINKING_END][HEART:private-command]\n" + failure + "\n上游信息：Cookie=session-secret Authorization: Bearer sk-test-secret-1234";
  const rendered = html([mapMessage(messageWire({ content, thinking: null, drift: null }))], { kind: "idle" });
  expect(rendered).toContain("公开正文"); expect(rendered).toContain("bad_response_status_code");
  expect(rendered).not.toMatch(/session-secret|sk-test-secret|private-thinking|private-command/);
});

it("keeps a declared model failure unknown until its assistant is actually persisted", async () => {
  let saved = false;
  const controller = createChatSendController({ createUuid: () => "failure-not-saved",
    openExecution: async () => ({ kind: "stream", events: (async function* () {
      yield { type: "start" as const, assistantMessageId: "failed-id" };
      yield { type: "chunk" as const, content: "临时正文\n" + failure };
    })() }),
    reconcileHistory: async () => ({ persistedMessageIds: saved ? ["failed-id"] : [], regenerateTarget: null }),
  });
  await controller.send({ conversationId: "conv_a", content: "问题" }); await settled(controller);
  expect(controller.getState().kind).toBe("finalization-uncertain");
  expect(html([], controller.getState())).toContain("临时正文");
  expect(html([], controller.getState())).toContain("结果待确认");
  expect(await controller.regenerate({ conversationId: "conv_a", targetMessageId: "failed-id", targetCreatedAt: 1 })).toBe(false);
  saved = true; await controller.retryFinalization();
  expect(controller.getState()).toMatchObject({ kind: "error", confirmedFailure: true, failedMessageId: "failed-id" });
  controller.dispose();
});

it("does not turn cancellation or an HTTP code inside raw error descriptions into HTTP 524", () => {
  const canceled = toSafeChatExecutionError(new ApiError("HTTP 524", 0, null, "ABORTED"));
  expect(canceled.message).not.toContain("524"); expect(canceled.message).toContain("后台可能仍在执行");
  const http = toSafeChatExecutionError(new ApiError("Proxy HTTP 524", 502, { detail: "HTTP 524 Cookie=secret" }));
  expect(http.message).toContain("HTTP 502"); expect(http.message).not.toMatch(/524|Cookie|secret/);
});

it("uses new HTTP content ahead of stale send overlays or a previous canonical attempt error", () => {
  const original = mapMessage(messageWire({ id: "target", content: "旧正文\n" + failure }));
  const newer = mapMessage(messageWire({ id: "target", content: "新 HTTP 正文" }));
  const error = { code: "provider-failure" as const, message: "最新一次尝试失败 HTTP 429", field: null, providerFailure: "provider_request_failed" as const };
  const state: ChatSendState = { kind: "error", conversationId: "conv_a", error, confirmedFailure: true, failedMessageId: "target", failedTargetContent: original.content };
  expect(html([original], state)).toContain("最新一次尝试失败 HTTP 429");
  expect(html([newer], state)).not.toContain("HTTP 429");
  const streaming: ChatSendState = { kind: "streaming", conversationId: "conv_a", executionId: "old", executionError: null,
    optimisticUser: { overlayId: "old-user", clientMessageId: "client", content: "old question", createdAt: 1 },
    assistant: { overlayId: "old-assistant", assistantMessageId: "target", content: "陈旧 SSE", thinking: null, simpleThink: null, usage: null, createdAt: 2 } };
  const messages = composeVisibleChatMessages([newer], streaming, "conv_a");
  expect(messages).toHaveLength(1); expect(messages[0].content).toBe("新 HTTP 正文");
});
