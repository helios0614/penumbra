import { apiGet, apiPost } from "@/lib/api";
import { ChatExecutionContractError } from "./chat-execution-types";

/** Public B projection. Transport state never supplies these facts. */
export type MainChatExecution = {
  readonly conversationId: string;
  readonly executionId: string;
  readonly kind: "send" | "regenerate";
  readonly requestId: string;
  readonly phase: "preparing" | "generating" | "finalizing" | "terminal";
  readonly terminal: boolean;
  readonly outcome: "completed" | "failed" | "cancelled" | null;
  readonly reason: string | null;
  readonly cancelRequested: boolean;
  readonly userMessageId: string | null;
  readonly targetMessageId: string | null;
  readonly assistantMessageId: string | null;
  readonly partialText: string;
  readonly ownerAvailable: boolean;
  readonly cancelable: boolean;
};
export function encodeChatExecutionId(kind: MainChatExecution["kind"], requestId: string): string {
  const binary = Array.from(new TextEncoder().encode(requestId), byte => String.fromCharCode(byte)).join("");
  return `${kind}.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
export function mapMainChatExecution(value: unknown, conversationId: string, executionId?: string): MainChatExecution {
  if (!value || typeof value !== "object") throw new ChatExecutionContractError("Invalid execution result");
  const r = value as Record<string, unknown>;
  const nullableString = (v: unknown) => v === null || typeof v === "string";
  if (r.conv_id !== conversationId || typeof r.request_id !== "string" || !r.request_id ||
      (r.kind !== "send" && r.kind !== "regenerate") || r.execution_id !== encodeChatExecutionId(r.kind, r.request_id) ||
      executionId !== undefined && r.execution_id !== executionId ||
      !["preparing", "generating", "finalizing", "terminal"].includes(String(r.phase)) ||
      (r.outcome !== null && r.outcome !== "completed" && r.outcome !== "failed" && r.outcome !== "cancelled") ||
      typeof r.terminal !== "boolean" || r.terminal !== (r.outcome !== null) ||
      !nullableString(r.reason) || !nullableString(r.user_message_id) || !nullableString(r.target_message_id) || !nullableString(r.assistant_message_id) ||
      typeof r.partial_text !== "string" || typeof r.cancel_requested !== "boolean" || typeof r.owner_available !== "boolean" || typeof r.cancelable !== "boolean") {
    throw new ChatExecutionContractError("Execution result identity or state mismatch");
  }
  return { conversationId, executionId: r.execution_id as string, kind: r.kind, requestId: r.request_id,
    phase: r.phase as MainChatExecution["phase"], terminal: r.terminal, outcome: r.outcome as MainChatExecution["outcome"],
    reason: r.reason as string | null, cancelRequested: r.cancel_requested, userMessageId: r.user_message_id as string | null,
    targetMessageId: r.target_message_id as string | null, assistantMessageId: r.assistant_message_id as string | null,
    partialText: r.partial_text, ownerAvailable: r.owner_available, cancelable: r.cancelable };
}
function path(conversationId: string, executionId: string): string {
  return `/api/conversations/${encodeURIComponent(conversationId)}/executions/${encodeURIComponent(executionId)}`;
}
export async function readChatExecution(conversationId: string, executionId: string): Promise<MainChatExecution> {
  const result = await apiGet<{ execution: unknown }>(path(conversationId, executionId), { cache: "no-store" });
  return mapMainChatExecution(result?.execution, conversationId, executionId);
}
export async function readActiveChatExecution(conversationId: string): Promise<MainChatExecution | null> {
  const result = await apiGet<{ execution: unknown }>(path(conversationId, "active"), { cache: "no-store" });
  return result?.execution === null ? null : mapMainChatExecution(result?.execution, conversationId);
}
export async function cancelChatExecution(conversationId: string, executionId: string) {
  const result = await apiPost<{ execution: unknown; cancel_accepted: boolean }>(`${path(conversationId, executionId)}/cancel`, undefined, { cache: "no-store" });
  if (typeof result?.cancel_accepted !== "boolean") throw new ChatExecutionContractError("Invalid cancel result");
  return { execution: mapMainChatExecution(result.execution, conversationId, executionId), cancelAccepted: result.cancel_accepted };
}
