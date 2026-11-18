import { describe, expect, it } from "vitest";
import type { ChatSendState } from "@/application/chat-send";
import type { ChatWorkspaceControllerState } from "./chat-workspace-controller";
import { messageDeleteWorkspaceReason } from "./chat-message-delete-policy";

const ready = { status: "ready", pendingConversationId: null, workspace: { selectedConversationId: "conv_a", history: { messages: [] } } } as unknown as ChatWorkspaceControllerState;
describe("saved message deletion safety", () => {
  it.each(["sending-user", "streaming", "finalizing", "finalization-uncertain", "regenerate-streaming", "regenerate-finalizing", "regenerate-finalization-uncertain"])("allows other persistent messages during %s", kind => {
    expect(messageDeleteWorkspaceReason(ready, { kind, conversationId: "conv_a" } as ChatSendState, "old-message")).toBeNull();
    expect(messageDeleteWorkspaceReason(ready, { kind, conversationId: "conv_b" } as ChatSendState)).toBeNull();
  });
  it("does not block unrelated messages on an unknown transport error", () => {
    expect(messageDeleteWorkspaceReason(ready, { kind: "idle" })).toBeNull();
    expect(messageDeleteWorkspaceReason(ready, { kind: "error", confirmedFailure: true } as ChatSendState)).toBeNull();
    expect(messageDeleteWorkspaceReason(ready, { kind: "error" } as ChatSendState)).toBeNull();
    expect(messageDeleteWorkspaceReason({ status: "loading" }, { kind: "idle" })).not.toBeNull();
  });
  it("protects only this live send's accepted User", () => {
    const state = { kind: "streaming", conversationId: "conv_a", optimisticUser: { persistedMessageId: "current-user" } } as ChatSendState;
    expect(messageDeleteWorkspaceReason(ready, state, "current-user")).toContain("当前请求");
    expect(messageDeleteWorkspaceReason(ready, state, "other-user")).toBeNull();
  });

});
