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

const live = vi.hoisted(() => ({ active: false, state: null as unknown as ChatWorkspaceControllerState }));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("@/components/chat-workspace/useChatWorkspace", () => ({ useChatWorkspace: () => ({ state: live.state, getState: () => live.state }) }));
vi.mock("@/components/chat-workspace", async original => ({
  ...await original<typeof import("@/components/chat-workspace")>(),
  useChatRealtime: () => ({ kind: "idle" }),
  useChatSend: () => ({ state: { kind: "idle" }, getState: () => ({ kind: "idle" }), isExecutionActive: () => live.active }),
}));
afterEach(() => vi.restoreAllMocks());
beforeEach(() => { live.active = false; live.state = ready(); });

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
  it("keeps the return button disabled during the existing conversation mutation lock", () => {
    const state = { ...ready(), conversationMutation: "create" as const };
    const hooks = hookSession(() => ChatWorkspaceView({ state, onBack: vi.fn(), onRetry: vi.fn(), onSelectConversation: vi.fn(), onRetryConversationSwitch: vi.fn() }));
    const header = find(hooks.render(), ChatShell).props.header;
    expect(find(header, Button, props => props["aria-label"] === "返回桌面").props.disabled).toBe(true);
    expect((find(header, SheetTrigger).props.render as React.ReactElement<React.ComponentProps<typeof Button>>).props.disabled).not.toBe(true);
    hooks.dispose();
  });
  it("rechecks live execution and mutation ownership even when a previously enabled return callback is invoked", () => {
    const home = vi.fn(), hooks = hookSession(() => ChatView({ onBack: home }));
    const view = hooks.render() as React.ReactElement<ChatWorkspaceViewProps>;
    const back = view.props.onBack!;
    live.active = true; back(); expect(home).not.toHaveBeenCalled();
    live.active = false; live.state = { ...ready(), conversationMutation: "delete" }; back(); expect(home).not.toHaveBeenCalled();
    live.state = ready(); back(); expect(home).toHaveBeenCalledOnce();
    hooks.dispose();
  });
});
