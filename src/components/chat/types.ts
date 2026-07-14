/**
 * Chat 类型定义
 * 对齐 AionsHome 后端 API 返回的 JSON 结构
 */

// ─── 会话 ───

export interface Conversation {
  id: string; // "conv_{timestamp}"
  title: string;
  model: string;
  created_at: number; // Unix timestamp (float)
  updated_at: number;
  message_count: number;
}

// ─── 消息 ───

export interface MusicAttachment {
  type: "music";
  id: string | number;
  name: string;
  artist: string;
  album?: string;
  audio_url?: string;
}

export type ChatAttachment =
  | string
  | MusicAttachment
  | Record<string, unknown>;

export interface McpToolCall {
  server: string;
  tool: string;
  args?: string | Record<string, unknown>;
  result?: string;
  error?: string;
  success: boolean;
}

export interface ChatMessage {
  id: string; // "msg_{timestamp}"
  conv_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
  attachments: ChatAttachment[];
  simple_think: string; // AI 随想
  thinking: string; // Claude 扩展思考
  mcp_tool_calls: McpToolCall[];
  cache_region: string; // "freeze" | "slide" | ""
  is_carryover: number; // 1 = 从上个会话继承
}

// ─── 发送消息请求 ───

export interface SendMessageRequest {
  content: string;
  context_limit?: number;
  attachments?: string[];
  whisper_mode?: boolean;
  fast_mode?: boolean;
  temperature?: number;
  carryover_messages?: object[];
  client_msg_id?: string;
}

// ─── SSE 事件 ───

export type SSEEventType =
  | "start"
  | "chunk"
  | "mcp_loading"
  | "debug"
  | "music"
  | "heart_whisper"
  | "toy_command"
  | "cam_check"
  | "poi_search"
  | "activity_check"
  | "location_check"
  | "done";

export interface SSEEvent {
  type: SSEEventType;
  id?: string;
  content?: string;
  [key: string]: unknown;
}

export interface HeartWhisperEvent {
  type: "heart_whisper";
  id: string;
  msg_id: string;
  content: string;
  created_at: number;
}

// ─── 创建会话请求 ───

export interface CreateConversationRequest {
  title?: string;
  model?: string;
}

// ─── 更新会话请求 ───

export interface UpdateConversationRequest {
  title?: string;
  model?: string;
}
