/** Display-only facts and sanitized legacy system prose; never runtime inputs. */
export type CapabilityStatus = "success" | "failed" | "partial" | "skipped" | "timeout" | "cancelled" | "unknown" | "sent";
export type AiDelivery = "response_received" | "prepared" | "not_included" | "not_requested" | "unknown";
export type CapabilityField = { readonly label: string; readonly text: string };
export type PublicToolCall = {
  readonly identifier: string;
  readonly capability: string;
  readonly status: CapabilityStatus;
  readonly fields: readonly CapabilityField[];
  readonly notices: readonly string[];
};
export type CapabilityRecord = {
  readonly kind: "trigger" | "operation" | "result";
  readonly capability: string;
  readonly title: string;
  readonly status: CapabilityStatus;
  readonly fields: readonly CapabilityField[];
  readonly notices: readonly string[];
  readonly calls: readonly PublicToolCall[];
  readonly summary?: string;
  readonly preview?: string;
  readonly previewLines?: 2;
};
export type MessageReaction = {
  readonly id: string;
  readonly targetMessageId: string;
  readonly sourceMessageId: string | null;
  readonly emoji: string;
};
export type MessageCapabilities = {
  readonly conversationId: string;
  readonly display: CapabilityRecord | null;
  readonly results: readonly (CapabilityRecord & { readonly id: string })[];
  readonly reaction: MessageReaction | null;
  readonly hasHeart: boolean;
  readonly heartRevision: string | null;
};
