import type {
  ChatReadinessDto,
  ChatReadinessReasonCodeDto,
  ModelSummaryDto,
  SessionStatusDto,
} from "@/domain/runtime/runtime-dto";
import {
  RuntimeContractError,
  type AvailableModel,
  type ChatReadiness,
  type ChatReadinessReason,
  type SessionState,
} from "@/domain/runtime/runtime-types";

const readinessReasons: Record<ChatReadinessReasonCodeDto, ChatReadinessReason> = {
  ready: "ready",
  unknown_model: "unknown-model",
  provider_not_configured: "provider-not-configured",
  generation_not_supported: "configuration-invalid",
  configuration_invalid: "configuration-invalid",
};

export function mapSessionStatus(payload: unknown): SessionState {
  if (!isRecord(payload) || payload.authenticated !== true) {
    throw contractError("session");
  }

  const dto: SessionStatusDto = { authenticated: payload.authenticated };
  void dto;
  return { status: "authenticated" };
}

export function mapAvailableModels(payload: unknown): AvailableModel[] {
  if (!Array.isArray(payload)) {
    throw contractError("models");
  }

  return payload.map((item) => {
    if (!isRecord(item) || !isNonEmptyString(item.key) || !isNonEmptyString(item.provider)) {
      throw contractError("models");
    }

    const dto: ModelSummaryDto = { key: item.key, provider: item.provider };
    return {
      key: dto.key,
      // The backend has no display label yet; key is the temporary UI label.
      label: dto.key,
      provider: dto.provider,
    };
  });
}

export function mapChatReadiness(payload: unknown): ChatReadiness {
  if (
    !isRecord(payload) ||
    typeof payload.ready !== "boolean" ||
    typeof payload.model_key !== "string" ||
    !isReadinessReason(payload.reason_code) ||
    typeof payload.setup_action_required !== "boolean"
  ) {
    throw contractError("chat readiness");
  }

  const dto: ChatReadinessDto = {
    ready: payload.ready,
    model_key: payload.model_key,
    reason_code: payload.reason_code,
    setup_action_required: payload.setup_action_required,
  };
  return {
    ready: dto.ready,
    modelKey: dto.model_key,
    reason: readinessReasons[dto.reason_code],
    setupActionRequired: dto.setup_action_required,
    ...(dto.reason_code === "generation_not_supported"
      ? { generationUnsupported: true as const }
      : {}),
  };
}

function contractError(contract: string): RuntimeContractError {
  return new RuntimeContractError(`Backend response does not match the ${contract} contract`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isReadinessReason(value: unknown): value is ChatReadinessReasonCodeDto {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(readinessReasons, value);
}
