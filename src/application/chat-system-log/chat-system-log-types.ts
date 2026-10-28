import type { JsonValue } from "@/domain/message";
export type LogContext = { executionId: string; conversationId: string; kind: "send" | "regenerate"; targetId?: string };
export type RequestSnapshot = {
  id: string; executionId: string; conversationId: string; kind: "send" | "regenerate";
  time: number; model: string; protocol: string; source: string; endpoint: string;
  payloadJson: string; stage: string; complete: boolean; limitations: readonly string[];
};
export type SystemLogEntry = {
  id: string; time: number; source: "sse" | "ws" | "request" | "http";
  executionId?: string; conversationId?: string; messageId?: string; targetId?: string; kind?: "send" | "regenerate";
  model?: string; protocol?: string; hasError: boolean; connectionUnknown?: boolean;
  error?: string; usage?: Readonly<Record<string, number>>; recallCount?: number;
  details?: JsonValue; requests: readonly RequestSnapshot[]; requestsRemoved?: boolean;
};
export type SystemLogState = { entries: readonly SystemLogEntry[]; unread: boolean; removedRequests: number; clearedAt: number };
