export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type MessageRoleKind =
  | "user"
  | "assistant"
  | "system"
  | "hidden-runtime"
  | "unknown";

export type MessageVoice = {
  readonly audioId: string;
  readonly messageId: string;
  readonly provider: string;
  readonly voiceId: string;
  readonly url: string;
  readonly duration: number | null;
  readonly favorited: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
};

/** A message that has already been persisted and can be read from HTTP history. */
export type Message = {
  readonly id: string;
  readonly conversationId: string;
  readonly rawRole: string;
  readonly roleKind: MessageRoleKind;
  readonly content: string;
  readonly createdAt: number;
  readonly simpleThink: string | null;
  readonly thinking: string | null;
  readonly isCarryover: boolean | null;
  readonly attachments: readonly JsonValue[];
  readonly mcpToolCalls: readonly JsonValue[];
  readonly cacheRegion: string | null;
  readonly voice: MessageVoice | null;
  readonly capabilities?: import("./capability-types").MessageCapabilities;
};

export type MessageHistoryQuery = {
  readonly limit?: number;
  readonly before?: number;
};

export class MessageContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageContractError";
  }
}
