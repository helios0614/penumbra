import { ApiError } from "@/lib/api";

/** Only known application preflight responses prove the request was rejected.
 * Proxy HTTP statuses (including 499), HTML and bare 4xx are transport evidence.
 */
export function isDefiniteChatRejection(error: unknown, kind: "send" | "regenerate" = "send"): boolean {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== "object") return false;
  const root = error.data as Record<string, unknown>;
  if (error.status === 401 && root.error === "未登录") return true;
  const detail = root.detail;
  if (error.status === 404 && detail === "Conversation not found") return true;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return false;
  const code = (detail as Record<string, unknown>).code;
  if (typeof code === "string" && code.startsWith("regenerate_") && kind !== "regenerate") return false;
  // _require_executable_conversation_model / _resolve_chat_generation_request
  // emit these before _persist_send_messages, never from a running provider.
  const mainPreflight = ["main_selection_required", "main_default_not_selected", "literal_model_required", "invalid_main_selection",
    "missing_profile", "disabled_profile", "invalid_base_url", "missing_base_url", "missing_credential", "incompatible_protocol",
    "unknown_legacy_model", "malformed_api_configs", "invalid_api_config_id", "duplicate_api_config_id", "ambiguous_legacy_selection",
    "unsupported_legacy_borrowed_credential", "unsupported_legacy_borrowed_endpoint", "invalid_legacy_configuration", "missing_model",
    "invalid_legacy_wire_model", "unsupported_legacy_wire_model_conversion", "unsupported_legacy_endpoint_conversion"];
  if ((error.status === 409 || error.status === 503) && typeof code === "string" && mainPreflight.includes(code)) return true;
  const allowed: Record<number, readonly string[]> = {
    404: ["regenerate_target_not_found"],
    409: ["unknown_model", "regenerate_conflict", "regenerate_target_not_latest", "main_selection_required", "main_default_not_selected", "literal_model_required", "invalid_main_selection", "legacy_selection_unresolved"],
    422: ["invalid_generation_options", "unsupported_generation_option", "regenerate_target_invalid"],
    503: ["provider_not_configured", "chat_defaults_invalid"],
  };
  return typeof code === "string" && !!allowed[error.status]?.includes(code);
}
