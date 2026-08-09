export type SessionStatusDto = {
  authenticated: true;
};

export type ModelSummaryDto = {
  key: string;
  provider: string;
};

export type ChatReadinessReasonCodeDto =
  | "ready"
  | "unknown_model"
  | "provider_not_configured"
  | "generation_not_supported"
  | "configuration_invalid";

export type ChatReadinessDto = {
  ready: boolean;
  model_key: string;
  reason_code: ChatReadinessReasonCodeDto;
  setup_action_required: boolean;
};
