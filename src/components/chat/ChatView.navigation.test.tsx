import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArrowLeft, Menu } from "lucide-react";
import { ChatView, ChatWorkspaceView, type ChatWorkspaceViewProps } from "./ChatView";
import type { ChatWorkspaceControllerState } from "@/components/chat-workspace";
import { ChatShell } from "./ChatShell";
import { ConversationsList } from "./ConversationsList";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { elements, find, hookSession } from "./test-utils/hook-session";
import { ConversationMenu } from "./ConversationActions";
import { ChatRequestParametersMenu } from "./ChatRequestParametersMenu";
import { BubbleList } from "./BubbleList";
import { ChatSearchReveal } from "./ChatSearchReveal";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";

const live = vi.hoisted(() => ({ active: false, state: null as unknown as ChatWorkspaceControllerState, send: vi.fn(async () => true) }));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("@/components/chat-workspace/useChatWorkspace", () => ({ useChatWorkspace: () => ({ state: live.state, getState: () => live.state }) }));
vi.mock("@/components/chat-workspace", async original => ({
  ...await original<typeof import("@/components/chat-workspace")>(),
  useChatRealtime: () => ({ kind: "idle" }),
  useChatSend: () => ({ state: { kind: "idle" }, getState: () => ({ kind: "idle" }), isExecutionActive: () => live.active, send: live.send }),
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => { live.active = false; live.state = ready(); live.send.mockClear(); });

function ready(): Extract<ChatWorkspaceControllerState, { status: "ready" }> {
  return {
    status: "ready", pendingConversationId: null, switchError: null,
    workspace: {
      conversations: [], selectedConversationId: null, selectedConversation: null, history: null,
      setup: { conversationId: null, conversationTitle: null, modelKey: null, modelLabel: null, modelKnown: false,
        models: [], status: "readiness-unavailable", setupActionRequired: true, readiness: { kind: "unavailable", reason: "unknown" } },
    },
  };
}

describe("Chat home and conversation navigation are independent", () => {
  it("keeps search in the overlay and closes without issuing a chat scroll jump", () => {
    vi.stubGlobal("document", new EventTarget());
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
    const base = ready(), conversation = { id: "conv_a", title: "A", modelKey: "fixture", createdAt: 1, updatedAt: 1, messageCount: 1 };
    const state = { ...base, workspace: { ...base.workspace, conversations: [conversation], selectedConversationId: conversation.id, selectedConversation: conversation,
      history: { conversationId: conversation.id, messages: [mapMessage(messageWire())], pageSize: 50, oldestCursor: 1, olderPageStatus: "exhausted" as const } } };
    const hooks = hookSession(() => ChatWorkspaceView({ state, onRetry: vi.fn(), onSelectConversation: vi.fn(), onRetryConversationSwitch: vi.fn() }));
    const shell = () => find(hooks.render(), ChatShell).props;
    const first = shell(); hooks.commit();
    const reading = { capture: () => ({ following: true, anchor: { id: "message", offset: 16 } }), suspend: vi.fn(), resumeFollowing: vi.fn() };
    find(first.children, BubbleList).props.readingRef!.current = reading;
    find(first.header, Button, p => p["aria-label"] === "搜索聊天历史").props.onClick?.({} as never);
    const opened = shell(); hooks.commit();
    expect(find(opened.overlay, ChatSearchReveal).props.open).toBe(true);
    expect(elements(opened.notices).some(n => n.type === ChatSearchReveal)).toBe(false);
    find(opened.header, Button, p => p["aria-label"] === "搜索聊天历史").props.onClick?.({} as never);
    const closed = shell(); hooks.commit();
    expect(find(closed.overlay, ChatSearchReveal).props.open).toBe(false);
    expect(find(closed.children, BubbleList).props.jump).toBeNull();
    expect(reading.resumeFollowing).toHaveBeenCalledOnce();
    hooks.dispose();
  });
  it("places search before quick parameters and keeps conversation actions in the shared sidebar/drawer", () => {
    const base = ready(), conversation = { id: "a", title: "一个需要保留省略逻辑的很长会话标题", modelKey: "fixture", createdAt: 1, updatedAt: 1, messageCount: 0 };
    const state = { ...base, workspace: { ...base.workspace, conversations: [conversation], selectedConversationId: "a", selectedConversation: conversation } };
    const hooks = hookSession(() => ChatWorkspaceView({ state, onRetry: vi.fn(), onSelectConversation: vi.fn(), onRetryConversationSwitch: vi.fn(), onRenameConversation: vi.fn(async () => {}), onDeleteConversation: vi.fn(async () => {}) }));
    const header = find(hooks.render(), ChatShell).props.header;
    const controls = elements(header);
    const searchIndex = controls.findIndex(n => n.type === Button && n.props["aria-label"] === "搜索聊天历史");
    const menuIndex = controls.findIndex(n => n.type === ChatRequestParametersMenu);
    expect(searchIndex).toBeGreaterThanOrEqual(0);
    expect(searchIndex).toBeLessThan(menuIndex);
    expect(find(header, Button, p => p["aria-label"] === "搜索聊天历史").props.title).toBe("搜索聊天历史");
    expect(controls.some(n => n.type === ConversationMenu)).toBe(false);
    const shell = find(hooks.render(), ChatShell).props;
    expect(find(shell.sidebar, ConversationsList).props.onAction).toBeTypeOf("function");
    expect(find(header, ConversationsList).props.onAction).toBeTypeOf("function");
    hooks.dispose();
  });
  it("rejects an old conversation's media callback even before React renders the new selection", async () => {
    const selected = (id: string): Extract<ChatWorkspaceControllerState, { status: "ready" }> => {
      const state = ready(), conversation = { id, title: id, modelKey: "fixture", createdAt: 1, updatedAt: 1, messageCount: 0 };
      return { ...state, workspace: { ...state.workspace, selectedConversationId: id, selectedConversation: conversation,
        history: { conversationId: id, messages: [], pageSize: 50, oldestCursor: null, olderPageStatus: "exhausted" },
        setup: { ...state.workspace.setup, conversationId: id, modelKey: "fixture", status: "ready", readiness: { kind: "available", value: { ready: true, reason: "ready", modelKey: "fixture", setupActionRequired: false } } } } };
    };
    live.state = selected("A");
    const hooks = hookSession(() => ChatView({}));
    const oldCallback = (hooks.render() as React.ReactElement<ChatWorkspaceViewProps>).props.onSend!;
    live.state = selected("B");
    expect(await oldCallback("", ["/uploads/1700000000000.png"], "A")).toBe(false); expect(live.send).not.toHaveBeenCalled();
    expect(await oldCallback("", ["/uploads/1700000000000.png"], "B")).toBe(true);
    expect(live.send).toHaveBeenCalledWith({ conversationId: "B", content: "", generation: { attachments: ["/uploads/1700000000000.png"] } }); hooks.dispose();
  });
  it("keeps ArrowLeft bound to the supplied home callback and Menu bound only to Sheet", () => {
    const home = vi.fn(), select = vi.fn();
    const hooks = hookSession(() => ChatWorkspaceView({ state: ready(), onBack: home, onCreateConversation: vi.fn(async () => {}), onRetry: vi.fn(), onSelectConversation: select, onRetryConversationSwitch: vi.fn() }));
    const header = () => find(hooks.render(), ChatShell).props.header;
    const sheet = () => find(header(), Sheet).props;
    const back = find(header(), Button, props => props["aria-label"] === "返回桌面");
    expect(React.isValidElement(back.props.children) && back.props.children.type).toBe(ArrowLeft);
    expect(back.props.className).not.toContain("hidden");
    expect(elements(header()).some(item => item.props["aria-label"] === "新建会话")).toBe(false);
    expect(find(find(hooks.render(), ChatShell).props.sidebar, ConversationsList).props.onCreate).toBeDefined();
    const trigger = find(header(), SheetTrigger);
    expect(React.isValidElement(trigger.props.children) && trigger.props.children.type).toBe(Menu);
    expect((trigger.props.render as React.ReactElement<React.ComponentProps<typeof Button>>).props["aria-label"]).toBe("打开会话列表");
    expect(sheet().open).toBe(false);
    back.props.onClick?.({} as never);
    expect(home).toHaveBeenCalledOnce(); expect(sheet().open).toBe(false);
    sheet().onOpenChange?.(true, {} as never);
    expect(sheet().open).toBe(true); expect(home).toHaveBeenCalledOnce();
    find(header(), ConversationsList).props.onSelect("b");
    expect(select).toHaveBeenCalledWith("b"); expect(sheet().open).toBe(false); expect(home).toHaveBeenCalledOnce();
    hooks.dispose();
  });
  it("allows home navigation while a conversation mutation remains owned by its workspace", () => {
    const state = { ...ready(), conversationMutation: "create" as const };
    const hooks = hookSession(() => ChatWorkspaceView({ state, onBack: vi.fn(), onRetry: vi.fn(), onSelectConversation: vi.fn(), onRetryConversationSwitch: vi.fn() }));
    const header = find(hooks.render(), ChatShell).props.header;
    expect(find(header, Button, props => props["aria-label"] === "返回桌面").props.disabled).toBe(false);
    expect((find(header, SheetTrigger).props.render as React.ReactElement<React.ComponentProps<typeof Button>>).props.disabled).not.toBe(true);
    hooks.dispose();
  });
  it("does not turn navigation into execution cancellation or a mutation lock", () => {
    const home = vi.fn(), hooks = hookSession(() => ChatView({ onBack: home }));
    const view = hooks.render() as React.ReactElement<ChatWorkspaceViewProps>;
    const back = view.props.onBack!;
    live.active = true; back(); expect(home).toHaveBeenCalledTimes(1);
    live.active = false; live.state = { ...ready(), conversationMutation: "delete" }; back(); expect(home).toHaveBeenCalledTimes(2);
    live.state = ready(); back(); expect(home).toHaveBeenCalledTimes(3);
    hooks.dispose();
  });
});
