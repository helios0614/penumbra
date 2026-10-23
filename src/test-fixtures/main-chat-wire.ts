// Synthetic current AionHome wire shapes. Never populated from real user data.
export const OPENAI = "openai_chat_completions";
export const ANTHROPIC = "anthropic_messages";
export function mainConfigurationWire(model = "literal-not-in-catalog", connectionId = "connection-a") {
  return {
    connections: [{ id: connectionId, name: "Synthetic connection", base_url: "https://synthetic.invalid/v1",
      enabled: true, default_model: "prefill-only", transport: "direct", gateway_id: null,
      credential_configured: true }],
    allowed_protocols: [OPENAI, ANTHROPIC],
    profiles: [], models: [], selection: null,
    connection_selection: { connection_id: connectionId, protocol: OPENAI, model }, diagnostic: null,
  };
}
export function readinessWire(model = "literal-not-in-catalog", code = "ready") {
  return { ready: code === "ready", model_key: model, reason_code: code, setup_action_required: code !== "ready" };
}
export function messageWire(overrides: Record<string, unknown> = {}) {
  return { id: "assistant-a", conv_id: "conv_a", role: "assistant", content: "synthetic answer",
    created_at: 10, drift: "独立随想", thinking: "独立思考", is_carryover: 0,
    attachments: [], mcp_tool_calls: [], cache_region: null, ...overrides };
}

/** HTTP canonicalize_drift_mapping omits drift when the legacy DB column is empty/null. */
export function messageWithoutDriftWire(overrides: Record<string, unknown> = {}) {
  const { drift: _drift, ...message } = messageWire(overrides);
  return message;
}
