import { describe, expect, it } from "vitest";
import type { ChatSendState } from "@/application/chat-send";
import type { ChatWorkspaceControllerState } from "./chat-workspace-controller";
import { messageDeleteWorkspaceReason } from "./chat-message-delete-policy";

const ready = { status: "ready", pendingConversationId: null, workspace: { selectedConversationId: "conv_a", history: { messages: [] } } } as unknown as ChatWorkspaceControllerState;
describe("saved message deletion safety", () => {
  it.each(["sending-user", "streaming", "finalizing", "finalization-uncertain", "regenerate-streaming", "regenerate-finalizing", "regenerate-finalization-uncertain"])("locks %s while allowing another conversation", kind => {
    expect(messageDeleteWorkspaceReason(ready, { kind, conversationId: "conv_a" } as ChatSendState)).not.toBeNull();
    expect(messageDeleteWorkspaceReason(ready, { kind, conversationId: "conv_b" } as ChatSendState)).toBeNull();
  });
  it("allows confirmed execution completion/failure and denies unknown failure", () => {
    expect(messageDeleteWorkspaceReason(ready, { kind: "idle" })).toBeNull();
    expect(messageDeleteWorkspaceReason(ready, { kind: "error", confirmedFailure: true } as ChatSendState)).toBeNull();
    expect(messageDeleteWorkspaceReason(ready, { kind: "error" } as ChatSendState)).not.toBeNull();
    expect(messageDeleteWorkspaceReason({ status: "loading" }, { kind: "idle" })).not.toBeNull();
  });
});
