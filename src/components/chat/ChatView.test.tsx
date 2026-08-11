import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ChatSetupViewModel } from "@/application/chat-setup";
import type { ChatRealtimeState } from "@/application/chat-realtime";
import type { ChatSendState } from "@/application/chat-send";
import type { ChatWorkspaceSnapshot } from "@/application/chat-workspace";
import type { MessageHistoryState } from "@/application/message-history";
import { ChatWorkspaceView } from "@/components/chat/ChatView";
import type { ChatWorkspaceControllerState } from "@/components/chat-workspace";
import type { ConversationSummary } from "@/domain/conversation";
import type { Message } from "@/domain/message";

describe("ChatWorkspaceView bootstrap states", () => {
  it("renders an aria-busy workspace skeleton without mock data", () => {
    const html = render({ status: "loading" });

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("正在加载会话工作区");
    expect(html).not.toContain("今天天气真好");
  });

  it("renders a safe unauthenticated error and retry control", () => {
    const fakeCookie = "fake-cookie";
    const state = {
      status: "error",
      error: {
        code: "authentication",
        message: "会话读取需要重新登录或授权。",
      },
      cookie: fakeCookie,
    } as ChatWorkspaceControllerState;
    const html = render(state);

    expect(html).toContain("需要登录");
    expect(html).toContain("重新登录或授权");
    expect(html).toContain("重试");
    expect(html).not.toContain(fakeCookie);
  });

  it("renders safe network, timeout, and contract summaries", () => {
    const cases = [
      ["network", "无法连接服务", "暂时无法连接服务，请重试。"],
      ["timeout", "请求超时", "会话读取超时，请重试。"],
      ["contract", "会话数据暂时不可用", "会话数据暂时无法使用，请重试。"],
    ] as const;

    for (const [code, title, message] of cases) {
      const html = render({ status: "error", error: { code, message } });
      expect(html).toContain(title);
      expect(html).toContain(message);
      expect(html).not.toContain("127.0.0.1:18080");
    }
  });
});

describe("ChatWorkspaceView ready states", () => {
  it("renders a true empty conversation workspace without creating a mock conversation", () => {
    const html = render(ready(snapshot([], null, null)));

    expect(html).toContain("暂无会话");
    expect(html).toContain("创建会话将在后续阶段接入");
    expect(html).not.toContain("新建会话");
    expect(html).not.toContain("今天天气真好");
  });

  it("renders a no-selection prompt without history", () => {
    const conversations = [conversation("conv_a", "会话 A")];
    const html = render(ready(snapshot(conversations, null, null)));

    expect(html).toContain("请选择会话");
    expect(html).toContain("会话 A");
    expect(html).not.toContain("mock reply");
  });

  it("renders an empty-history state for a selected real conversation", () => {
    const selected = conversation("conv_a", "空会话");
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", []),
    )));

    expect(html).toContain("空会话");
    expect(html).toContain("暂无可显示的消息");
    expect(html).toContain("输入消息");
  });

  it("renders selected persistent history while keeping raw model metadata out of the header", () => {
    const selected = conversation("conv_a", "真实标题", {
      modelKey: "provider/model-with-a-very-long-key",
    });
    const hiddenContent = "fake-hidden-runtime-payload";
    const html = render(
      ready(snapshot(
        [selected],
        selected,
        history("conv_a", [
          message("user_1", "user", "user", "用户内容", 0),
          message("assistant_1", "assistant", "assistant", "**知远内容**", 1, {
            simpleThink: "简单想法",
            thinking: "扩展思考",
          }),
          message("system_1", "system", "system", "系统内容", 2),
          message("hidden_1", "cam_trigger", "hidden-runtime", hiddenContent, 3),
          message("unknown_1", "future_role", "unknown", "<b>未知内容</b>", 4),
        ]),
      )),
      vi.fn(),
    );

    expect(html).toContain("真实标题");
    expect(html).not.toContain("provider/model-with-a-very-long-key");
    expect(html).toContain('aria-label="返回桌面"');
    expect(html).toContain("h-14");
    expect(html).toContain("用户内容");
    expect(html).toContain("知远内容");
    expect(html).toContain("系统消息");
    expect(html).toContain("系统内容");
    expect(html).toContain("暂不支持的消息类型");
    expect(html).toContain("future_role");
    expect(html).toContain("&lt;b&gt;未知内容&lt;/b&gt;");
    expect(html).not.toContain(hiddenContent);
  });

  it("right-aligns user message segments with different widths", () => {
    const selected = conversation("conv_a", "会话 A");
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", [
        message("user_1", "user", "user", "短消息\n\n这是一段更长的用户消息", 1),
      ]),
    )));

    expect(html).toContain("短消息");
    expect(html).toContain("这是一段更长的用户消息");
    expect(html).toContain('class="flex min-w-0 flex-col gap-1 items-end"');
  });

  it("keeps old selection, header, and history during a pending atomic switch", () => {
    const selected = conversation("conv_a", "会话 A");
    const target = conversation("conv_b", "会话 B");
    const html = render(ready(
      snapshot(
        [selected, target],
        selected,
        history("conv_a", [message("a_1", "user", "user", "A 的历史", 1)]),
      ),
      { pendingConversationId: "conv_b" },
    ));

    expect(html).toContain("会话 A");
    expect(html).toContain("会话 B");
    expect(html).toContain("A 的历史");
    expect(html).toContain("正在切换会话");
    expect(html).not.toContain("B 的历史");
    expect(html).toContain('aria-label="正在切换到会话 B"');
    expect(html).toContain('aria-current="page"');
  });

  it("preserves the old workspace on switch error and exposes a safe switch retry", () => {
    const selected = conversation("conv_a", "会话 A");
    const html = render(ready(
      snapshot(
        [selected, conversation("conv_b", "会话 B")],
        selected,
        history("conv_a", [message("a_1", "user", "user", "保留的历史", 1)]),
      ),
      {
        switchError: {
          code: "network",
          message: "暂时无法连接服务，请重试。",
        },
      },
    ));

    expect(html).toContain("会话 A");
    expect(html).toContain("保留的历史");
    expect(html).toContain("重试切换");
    expect(html).toContain("暂时无法连接服务");
  });

  it("renders only the final C workspace after a successful A to B to C race", () => {
    const selected = conversation("conv_c", "会话 C");
    const html = render(ready(snapshot(
      [conversation("conv_a", "会话 A"), conversation("conv_b", "会话 B"), selected],
      selected,
      history("conv_c", [message("c_1", "assistant", "assistant", "C 的历史", 3)]),
    )));

    expect(html).toContain("C 的历史");
    expect(html).not.toContain("A 的历史");
    expect(html).not.toContain("B 的历史");
  });

  it("enables the composer only when selected readiness is ready and a send callback exists", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const selected = conversation("conv_a", "会话 A");
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", [message("a_1", "user", "user", "只读消息", 1)]),
    )), undefined, { onSend: vi.fn(async () => true) });

    expect(html).toContain("输入消息");
    expect(html).not.toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(/aria-label="发送消息"[^>]*disabled|disabled=""[^>]*aria-label="发送消息"/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps real conversations and history visible when readiness is unavailable", () => {
    const fakeEndpoint = "https://private-readiness.example";
    const selected = conversation("conv_a", "可读取会话");
    const workspace = {
      ...snapshot(
        [selected],
        selected,
        history("conv_a", [
          message("a_1", "assistant", "assistant", "持久化历史仍然可见", 1),
        ]),
      ),
      setup: unavailableSetup("network"),
      endpoint: fakeEndpoint,
    } as ChatWorkspaceSnapshot;

    const html = render(ready(workspace));

    expect(html).toContain("可读取会话");
    expect(html).toContain("持久化历史仍然可见");
    expect(html).toContain("当前发送服务暂时不可用");
    expect(html).not.toContain("会话服务暂时不可用");
    expect(html).not.toContain(fakeEndpoint);
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(/aria-label="发送消息"[^>]*disabled|disabled=""[^>]*aria-label="发送消息"/);
  });

  it("shows isolated realtime degradation without disabling an otherwise-ready sender", () => {
    const selected = conversation("conv_a", "会话 A");
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", [message("a_1", "user", "user", "历史仍可用", 1)]),
    )), undefined, {
      onSend: vi.fn(async () => true),
      realtimeState: { kind: "unavailable", reason: "network" },
    });

    expect(html).toContain("实时连接暂时不可用");
    expect(html).toContain("历史记录与发送仍可使用");
    expect(html).not.toMatch(/<textarea[^>]*disabled/);
  });

  it("offers canonical regenerate only on the latest eligible persisted assistant", () => {
    const selected = conversation("conv_a", "会话 A");
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", [
        message("assistant_old", "assistant", "assistant", "旧回复", 1),
        message("user_2", "user", "user", "新问题", 2),
        message("assistant_latest", "assistant", "assistant", "最新回复", 3),
      ]),
    )), undefined, {
      onSend: vi.fn(async () => true),
      onRegenerate: vi.fn(async () => true),
    });

    expect(html.match(/aria-label="重新生成回复"/g)).toHaveLength(1);
    expect(html).toContain("最新回复");
  });

  it("disables sender and conversation switching while regenerate owns execution", () => {
    const selected = conversation("conv_a", "会话 A");
    const sendState: ChatSendState = {
      kind: "regenerate-streaming",
      executionId: "regenerate-1",
      conversationId: "conv_a",
      targetMessageId: "assistant_latest",
      assistant: {
        overlayId: "regenerate-overlay",
        assistantMessageId: "assistant_latest",
        content: "临时新回复",
        thinking: null,
        simpleThink: null,
        usage: null,
        createdAt: 3,
      },
      executionError: null,
    };
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", [
        message("assistant_latest", "assistant", "assistant", "原回复", 3),
      ]),
    )), undefined, {
      onSend: vi.fn(async () => true),
      onRegenerate: vi.fn(async () => true),
      sendState,
    });

    expect(html).toContain("临时新回复");
    expect(html).not.toContain("原回复");
    expect(html).toContain("正在生成");
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*aria-label="当前无法切换到会话 A"|<button[^>]*aria-label="当前无法切换到会话 A"[^>]*disabled/,
    );
  });

  it("shows finalization uncertainty once instead of repeating it in sender footer", () => {
    const selected = conversation("conv_a", "会话 A");
    const messageText = "回复已结束，但暂时无法确认保存状态。";
    const sendState: ChatSendState = {
      kind: "regenerate-finalization-uncertain",
      executionId: "regenerate-uncertain",
      conversationId: "conv_a",
      targetMessageId: "assistant_latest",
      assistant: {
        overlayId: "regenerate-overlay",
        assistantMessageId: "assistant_latest",
        content: "临时新回复",
        thinking: null,
        simpleThink: null,
        usage: null,
        createdAt: 3,
      },
      executionError: null,
      error: {
        code: "service",
        message: messageText,
        field: null,
        providerFailure: null,
      },
    };
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", [
        message("assistant_latest", "assistant", "assistant", "原回复", 3),
      ]),
    )), undefined, {
      onSend: vi.fn(async () => true),
      sendState,
    });

    expect(html.split(messageText)).toHaveLength(2);
    expect(html).toContain("临时新回复");
    expect(html).not.toContain("原回复");
  });

  it("does not expose raw workspace payload fields or unsafe unknown role labels", () => {
    const forbidden = [
      "fake-api-key",
      "fake-authorization",
      "fake-cookie",
      "https://fake-endpoint.example",
      "fake-debug-payload",
    ];
    const selected = {
      ...conversation("conv_a", "会话 A"),
      apiKey: forbidden[0],
      authorization: forbidden[1],
      cookie: forbidden[2],
      endpoint: forbidden[3],
      debugPayload: forbidden[4],
    } as ConversationSummary;
    const html = render(ready(snapshot(
      [selected],
      selected,
      history("conv_a", [
        message("unknown_1", forbidden[1]!, "unknown", "普通文本", 1),
      ]),
    )));

    forbidden.forEach((value) => expect(html).not.toContain(value));
    expect(html).toContain("unknown");
  });
});

function render(
  state: ChatWorkspaceControllerState,
  onBack?: () => void,
  props: {
    readonly onSend?: (content: string) => Promise<boolean>;
    readonly onRegenerate?: (messageId: string) => Promise<boolean>;
    readonly sendState?: ChatSendState;
    readonly realtimeState?: ChatRealtimeState;
  } = {},
): string {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const html = renderToStaticMarkup(
    <ChatWorkspaceView
      state={state}
      onRetry={vi.fn()}
      onSelectConversation={vi.fn()}
      onRetryConversationSwitch={vi.fn()}
      onBack={onBack}
      onSend={props.onSend}
      onRegenerate={props.onRegenerate}
      sendState={props.sendState}
      realtimeState={props.realtimeState}
    />,
  );
  expect(consoleError).not.toHaveBeenCalled();
  expect(consoleWarn).not.toHaveBeenCalled();
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  return html;
}

function ready(
  workspace: ChatWorkspaceSnapshot,
  overrides: {
    readonly pendingConversationId?: string | null;
    readonly switchError?: Extract<ChatWorkspaceControllerState, { status: "ready" }>["switchError"];
  } = {},
): ChatWorkspaceControllerState {
  return {
    status: "ready",
    workspace,
    pendingConversationId: overrides.pendingConversationId ?? null,
    switchError: overrides.switchError ?? null,
  };
}

function snapshot(
  conversations: readonly ConversationSummary[],
  selectedConversation: ConversationSummary | null,
  selectedHistory: MessageHistoryState | null,
): ChatWorkspaceSnapshot {
  return {
    setup: setup(selectedConversation),
    conversations,
    selectedConversationId: selectedConversation?.id ?? null,
    selectedConversation,
    history: selectedHistory,
  };
}

function setup(
  selectedConversation: ConversationSummary | null = null,
): ChatSetupViewModel {
  const modelKey = selectedConversation?.modelKey ?? "bootstrap-model";
  return {
    conversationId: selectedConversation?.id ?? null,
    conversationTitle: selectedConversation?.title ?? null,
    modelKey,
    modelLabel: modelKey,
    modelKnown: true,
    models: [{
      key: modelKey,
      label: modelKey,
      provider: "safe-provider",
      selected: true,
    }],
    status: "ready",
    setupActionRequired: false,
    readiness: {
      kind: "available",
      value: {
        ready: true,
        modelKey,
        reason: "ready",
        setupActionRequired: false,
      },
    },
  };
}

function unavailableSetup(
  reason: "not-found" | "network" | "timeout" | "service" | "contract" | "unknown",
): ChatSetupViewModel {
  return {
    conversationId: null,
    conversationTitle: null,
    modelKey: null,
    modelLabel: null,
    modelKnown: false,
    models: [],
    status: "readiness-unavailable",
    setupActionRequired: true,
    readiness: { kind: "unavailable", reason },
  };
}

function conversation(
  id: string,
  title: string,
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id,
    title,
    modelKey: "conversation-model",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 0,
    ...overrides,
  };
}

function history(
  conversationId: string,
  messages: readonly Message[],
): MessageHistoryState {
  return {
    conversationId,
    messages,
    pageSize: 50,
    oldestCursor: messages[0]?.createdAt ?? null,
    olderPageStatus: messages.length === 0 ? "exhausted" : "maybe-more",
  };
}

function message(
  id: string,
  rawRole: string,
  roleKind: Message["roleKind"],
  content: string,
  createdAt: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: "conv_a",
    rawRole,
    roleKind,
    content,
    createdAt,
    simpleThink: null,
    thinking: null,
    isCarryover: false,
    attachments: [],
    mcpToolCalls: [],
    cacheRegion: null,
    voice: null,
    ...overrides,
  };
}
