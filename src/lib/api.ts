/**
 * API 客户端 — 对接 AionsHome 后端
 * 封装 fetch 调用 + SSE 流式解析
 */

import type {
  Conversation,
  ChatMessage,
  SendMessageRequest,
  CreateConversationRequest,
  UpdateConversationRequest,
  SSEEvent,
} from "@/components/chat/types";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:8000";

// ─── 通用 fetch 封装 ───

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// ─── 会话 CRUD ───

export async function listConversations(): Promise<Conversation[]> {
  return request<Conversation[]>("/api/conversations");
}

export async function createConversation(
  data?: CreateConversationRequest,
): Promise<Conversation> {
  return request<Conversation>("/api/conversations", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}

export async function updateConversation(
  convId: string,
  data: UpdateConversationRequest,
): Promise<Conversation> {
  return request<Conversation>(`/api/conversations/${convId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteConversation(convId: string): Promise<void> {
  await request<void>(`/api/conversations/${convId}`, {
    method: "DELETE",
  });
}

// ─── 消息 CRUD ───

export async function listMessages(
  convId: string,
  limit = 50,
  before?: number,
): Promise<ChatMessage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before != null) params.set("before", String(before));
  return request<ChatMessage[]>(
    `/api/conversations/${convId}/messages?${params}`,
  );
}

export async function deleteMessage(msgId: string): Promise<void> {
  await request<void>(`/api/messages/${msgId}`, {
    method: "DELETE",
  });
}

export async function editMessage(
  msgId: string,
  content: string,
): Promise<ChatMessage> {
  return request<ChatMessage>(`/api/messages/${msgId}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

// ─── SSE 流式解析 ───

/**
 * 解析 SSE 响应流，逐事件 yield
 * 对应 AionsHome 后端 StreamingResponse 的 `data: {...}\n\n` 格式
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // 最后一行可能不完整，保留在 buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const event = JSON.parse(jsonStr) as SSEEvent;
        yield event;
        if (event.type === "done") return;
      } catch {
        // 跳过解析失败的行
      }
    }
  }
}

// ─── 发送消息（SSE 流式）───

export function sendMessageStream(
  convId: string,
  data: SendMessageRequest,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${API_BASE}/api/conversations/${convId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

// ─── 重新生成（SSE 流式）───

export function regenerateStream(
  convId: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${API_BASE}/api/conversations/${convId}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
  });
}
