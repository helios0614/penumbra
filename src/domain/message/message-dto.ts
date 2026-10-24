import type { JsonValue } from "@/domain/message/message-types";

export type MessageVoiceDto = {
  audio_id: string;
  msg_id: string;
  provider: string;
  voice_id: string;
  url: string;
  duration: number | null;
  favorited: boolean;
  created_at: number;
  updated_at: number;
};

export type MessageDto = {
  id: string;
  conv_id: string;
  role: string;
  content: string;
  created_at: number;
  drift: string | null;
  is_carryover: 0 | 1 | null;
  attachments: JsonValue[];
  thinking: string | null;
  mcp_tool_calls: JsonValue[];
  cache_region: string | null;
  voice?: MessageVoiceDto;
  capabilities?: import("./capability-types").MessageCapabilities;
};

export type MessageHistoryDto = MessageDto[];
