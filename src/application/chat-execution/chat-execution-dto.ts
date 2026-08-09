export type SendMessageRequestDto = {
  content: string;
  context_limit?: number;
  attachments?: string[];
  whisper_mode?: boolean;
  fast_mode?: boolean;
  temperature?: number | null;
  thinking_effort?: string | null;
  client_msg_id?: string | null;
};

export type DuplicateSendAcknowledgementDto = {
  ok: true;
  msg_id: string;
  duplicate: true;
};

export type StartChatExecutionEventDto = {
  type: "start";
  id: string;
};

export type ChunkChatExecutionEventDto = {
  type: "chunk";
  content: string;
};

export type McpLoadingChatExecutionEventDto = {
  type: "mcp_loading";
  msg_id: string;
  tools: string;
};

export type HeartWhisperChatExecutionEventDto = {
  type: "heart_whisper";
  id: string;
  msg_id: string;
  content: string;
  created_at: number;
};

export type ToyCommandChatExecutionEventDto = {
  type: "toy_command";
  msg_id: string;
  commands: string[];
};

export type CameraCheckChatExecutionEventDto = {
  type: "cam_check";
  conv_id: string;
  model_key: string;
  msg_id: string;
};

export type CameraOfflineChatExecutionEventDto = {
  type: "cam_offline";
};

export type PoiSearchChatExecutionEventDto = {
  type: "poi_search";
  conv_id: string;
  categories: string[];
  msg_id: string;
};

export type ActivityCheckChatExecutionEventDto = {
  type: "activity_check";
  conv_id: string;
  n: number;
  msg_id: string;
};

export type MusicChatExecutionEventDto = {
  type: "music";
  msg_id: string;
  cards: unknown[];
};

export type DebugChatExecutionEventDto = {
  type: "debug";
  model: string;
  msg_id: string;
  usage: unknown;
  has_error: boolean;
};

/** The current direct send/regenerate SSE wire catalog. */
export type ChatExecutionEventDto =
  | StartChatExecutionEventDto
  | ChunkChatExecutionEventDto
  | McpLoadingChatExecutionEventDto
  | HeartWhisperChatExecutionEventDto
  | ToyCommandChatExecutionEventDto
  | CameraCheckChatExecutionEventDto
  | CameraOfflineChatExecutionEventDto
  | PoiSearchChatExecutionEventDto
  | ActivityCheckChatExecutionEventDto
  | MusicChatExecutionEventDto
  | DebugChatExecutionEventDto;
