import type { ChatProviderFailureCode } from "@/application/chat-execution";
import type {
  ChatGenerationOptionField,
  SafeChatExecutionError,
} from "@/application/chat-send/chat-send-types";
import { ApiError } from "@/lib/api";

const GENERATION_FIELDS = new Set<ChatGenerationOptionField>([
  "attachments",
  "client_msg_id",
  "temperature",
  "context_limit",
  "thinking_effort",
  "fast_mode",
  "whisper_mode",
]);

export function toSafeChatExecutionError(
  error: unknown,
): SafeChatExecutionError {
  if (error instanceof ApiError) {
    const detail = safeErrorDetail(error.data);

    if (error.status === 401 || error.status === 403) {
      return safeError("authentication", "发送需要重新登录或授权。");
    }
    if (error.status === 409 && detail.code === "unknown_model") {
      return safeError("unknown-model", "当前会话使用的模型已不可用。");
    }
    if (
      error.status === 422 &&
      detail.code === "invalid_generation_options"
    ) {
      return safeError(
        "invalid-generation-options",
        "当前生成参数无效。",
        detail.field,
      );
    }
    if (
      error.status === 422 &&
      detail.code === "unsupported_generation_option"
    ) {
      return safeError(
        "unsupported-generation-option",
        "当前模型不支持所选生成参数。",
        detail.field,
      );
    }
    if (
      error.status === 503 &&
      detail.code === "provider_not_configured"
    ) {
      return safeError(
        "provider-not-configured",
        "当前模型服务尚未配置完成。",
      );
    }
    if (error.code === "TIMEOUT") {
      return safeError("timeout", "发送请求超时，请稍后重试。");
    }
    if (error.code === "NETWORK_ERROR") {
      return safeError("network", "暂时无法连接发送服务，请重试。");
    }
    return safeError("service", "暂时无法发送消息，请重试。");
  }

  if (
    error instanceof Error &&
    (
      error.name.endsWith("ContractError") ||
      error.name === "SseDataError" ||
      error.name === "SseFramingError" ||
      error.name === "StreamContractError"
    )
  ) {
    return safeError("contract", "发送响应暂时无法安全处理。");
  }

  return safeError("unknown", "发送消息时发生错误，请重试。");
}

export function providerFailureError(
  failure: ChatProviderFailureCode | null,
): SafeChatExecutionError {
  return {
    code: "provider-failure",
    message: "当前回复生成失败，保存状态正在确认。",
    field: null,
    providerFailure: failure,
  };
}

export function finalizationUncertainError(): SafeChatExecutionError {
  return safeError(
    "service",
    "回复已结束，但暂时无法确认保存状态。",
  );
}

function safeError(
  code: SafeChatExecutionError["code"],
  message: string,
  field: ChatGenerationOptionField | null = null,
): SafeChatExecutionError {
  return { code, message, field, providerFailure: null };
}

function safeErrorDetail(data: unknown): {
  readonly code: string | null;
  readonly field: ChatGenerationOptionField | null;
} {
  const root = isRecord(data) ? data : null;
  const detail = root && isRecord(root.detail) ? root.detail : root;
  const code = detail && typeof detail.code === "string" ? detail.code : null;
  const rawField = detail && typeof detail.field === "string"
    ? detail.field
    : null;
  const field = rawField !== null && GENERATION_FIELDS.has(
    rawField as ChatGenerationOptionField,
  )
    ? rawField as ChatGenerationOptionField
    : null;
  return { code, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
