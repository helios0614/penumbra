export type RealtimeEnvelopeDto = {
  readonly type: string;
  readonly data?: unknown;
};

export type MessageRealtimeEventDto = RealtimeEnvelopeDto & {
  readonly type: "msg_created" | "msg_updated" | "msg_deleted";
  readonly data: {
    readonly id: string;
    readonly conv_id: string;
  };
};

export type ConversationRealtimeEventDto = RealtimeEnvelopeDto & {
  readonly type: "conv_created" | "conv_updated" | "conv_deleted";
  readonly data: {
    readonly id: string;
  };
};

export type FileSyncedRealtimeEventDto = RealtimeEnvelopeDto & {
  readonly type: "file_synced";
  readonly data: {
    readonly conv_id: string;
  };
};

export type KnownRealtimeEventDto =
  | MessageRealtimeEventDto
  | ConversationRealtimeEventDto
  | FileSyncedRealtimeEventDto;
