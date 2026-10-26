import type { ChatDefaults } from "@/domain/runtime/chat-defaults";

export const addedChatDefaults = (anthropic = false): Pick<ChatDefaults, "thinking" | "float_interval" | "carryover_count"> => ({
  thinking: { value: { enabled: false, effort: "medium" }, defaultValue: { enabled: false, effort: "medium" }, source: "backend_default",
    capability: { status: anthropic ? "unknown" : "unsupported", reason: anthropic ? "model_capability_unknown" : "protocol_unsupported",
      allowedEfforts: anthropic ? ["low", "medium", "high", "xhigh", "max"] : [] } },
  float_interval: { value: 12, defaultValue: 12, source: "backend_default", min: 1, max: 15 },
  carryover_count: { value: 0, defaultValue: 0, source: "backend_default", min: 0, max: 50 },
});
export function addedChatDefaultsWire(anthropic = false) {
  const defaults = addedChatDefaults(anthropic);
  const numeric = ({ defaultValue, ...value }: typeof defaults.float_interval) => ({ ...value, default_value: defaultValue });
  return { float_interval: numeric(defaults.float_interval), carryover_count: numeric(defaults.carryover_count),
    thinking: { value: defaults.thinking.value, default_value: defaults.thinking.defaultValue, source: defaults.thinking.source,
      capability: { status: defaults.thinking.capability.status, reason: defaults.thinking.capability.reason, allowed_efforts: defaults.thinking.capability.allowedEfforts } } };
}
