import { apiGet } from "@/lib/api";
import { ChatExecutionContractError } from "./chat-execution-types";
import { mapMainChatExecution, type MainChatExecution } from "./chat-execution-status";

export type StoppedChatResult = { readonly execution: MainChatExecution; readonly createdAt: number };
export type ChatExecutionResultsPage = { readonly results: readonly StoppedChatResult[]; readonly nextCursor: string | null };

/** A bounded read of durable public stopped results; never a message restore. */
export async function readChatExecutionResults(conversationId: string, before?: string): Promise<ChatExecutionResultsPage> {
  const query = new URLSearchParams({ limit: "50" });
  if (before !== undefined) query.set("before", before);
  const value = await apiGet<{ results: { execution: unknown; created_at: number }[]; next_cursor: string | null }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/executions/results?${query}`, { cache: "no-store" });
  if (!Array.isArray(value?.results) || value.results.length > 50 ||
      value.next_cursor !== null && (typeof value.next_cursor !== "string" || !value.next_cursor)) {
    throw new ChatExecutionContractError("Invalid execution results page");
  }
  const results = value.results.map(item => {
    const execution = mapMainChatExecution(item?.execution, conversationId);
    if (!execution.terminal || execution.outcome !== "cancelled" || !Number.isFinite(item.created_at)) {
      throw new ChatExecutionContractError("Invalid stopped execution result");
    }
    return { execution, createdAt: item.created_at };
  });
  return { results, nextCursor: value.next_cursor };
}
