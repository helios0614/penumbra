import type { ChatProviderFailureCode } from "@/application/chat-execution";
import type {
  ChatExecutionKind,
  ChatGenerationOptionField,
  SafeChatExecutionError,
} from "@/application/chat-send/chat-send-types";
import { ApiError } from "@/lib/api";
import { safeHttpErrorContent } from "@/domain/message/assistant-failure";
import { isDefiniteChatRejection } from "./chat-send-rejection";

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
  executionKind: ChatExecutionKind = "send",
): SafeChatExecutionError {
  const mapped = mapChatExecutionError(error, executionKind);
  const upstream = error instanceof ApiError && error.status > 0 ? safeHttpErrorContent(error.data) : null;
  if (error instanceof ApiError && error.status >= 400 && !isDefiniteChatRejection(error, executionKind)) {
    return { ...mapped, message: `连接返回 HTTP ${error.status}，生成结果尚未确认。请重新核对。${upstream ? `\n${upstream}` : ""}` };
  }
  return upstream && error instanceof ApiError
    ? { ...mapped, message: `请求失败（HTTP ${error.status}）\n${upstream}` } : mapped;
}

function mapChatExecutionError(
  error: unknown,
  executionKind: ChatExecutionKind,
): SafeChatExecutionError {
  const regenerate = executionKind === "regenerate";
  if (error instanceof ApiError) {
    const detail = safeErrorDetail(error.data);

    if (regenerate && error.status === 500 && detail.code === "regenerate_preflight_failed") {
      return safeError("service", "重新生成服务暂时出错，请稍后手动重试。");
    }

    if (error.status === 401 || error.status === 403) {
      return safeError(
        "authentication",
        `请求失败（HTTP ${error.status}）。`,
      );
    }
    if (
      regenerate &&
      error.status === 404 &&
      detail.code === "regenerate_target_not_found"
    ) {
      return safeError(
        "regenerate-target-not-found",
        "目标回复已不存在。",
      );
    }
    if (
      regenerate &&
      error.status === 422 &&
      detail.code === "regenerate_target_invalid"
    ) {
      return safeError(
        "regenerate-target-invalid",
        "当前回复不能重新生成。",
      );
    }
    if (
      regenerate &&
      error.status === 409 &&
      detail.code === "regenerate_target_not_latest"
    ) {
      return safeError(
        "regenerate-target-not-latest",
        "该回复已不是当前最新回复。",
      );
    }
    if (
      regenerate &&
      error.status === 409 &&
      detail.code === "regenerate_conflict"
    ) {
      return safeError(
        "regenerate-conflict",
        "会话已发生变化，请刷新后重试。",
      );
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
      return safeError(
        "timeout",
        regenerate
          ? "重新生成的响应等待超时，请重新读取状态确认结果。"
          : "发送的响应等待超时，请重新读取状态确认结果。",
      );
    }
    if (error.code === "NETWORK_ERROR") {
      return safeError(
        "network",
        regenerate
          ? "重新生成的连接中断，后台可能仍在执行，请重新读取状态。"
          : "发送的连接中断，后台可能仍在执行，请重新读取状态。",
      );
    }
    if (error.code === "ABORTED") {
      return safeError("network", "连接读取已取消，后台可能仍在执行，请重新读取状态。");
    }
    if (error.status >= 400 && error.status <= 599) {
      return safeError("service", `请求失败（HTTP ${error.status}）。`);
    }
    return safeError(
      "service",
      regenerate
        ? "暂时无法重新生成回复，请重试。"
        : "暂时无法发送消息，请重试。",
    );
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
    return safeError(
      "contract",
      regenerate
        ? "重新生成响应暂时无法安全处理。"
        : "发送响应暂时无法安全处理。",
    );
  }

  return safeError(
    "unknown",
    regenerate
      ? "重新生成回复时发生错误，请重试。"
      : "发送消息时发生错误，请重试。",
  );
}


export function providerFailureError(
  failure: ChatProviderFailureCode | null,
): SafeChatExecutionError {
  if (failure?.startsWith("regenerate_")) {
    const failures: Record<string, { code: SafeChatExecutionError["code"]; message: string }> = {
      regenerate_conflict: { code: "regenerate-conflict", message: "会话已发生变化，重新生成未提交。请重新读取状态。" },
      regenerate_target_not_found: { code: "regenerate-target-not-found", message: "目标回复已不存在，请重新读取状态。" },
      regenerate_target_not_latest: { code: "regenerate-target-not-latest", message: "该回复已不是最新回复，请重新读取状态。" },
      regenerate_target_invalid: { code: "regenerate-target-invalid", message: "该回复不能重新生成，请重新读取状态。" },
    };
    return { ...failures[failure], field: null, providerFailure: failure };
  }
  return {
    code: "provider-failure",
    message: failure === null ? "当前回复生成失败，请重新读取状态确认已保存的历史。" : "模型服务生成失败，请重新读取状态确认已保存的历史。",
    field: null,
    providerFailure: failure,
  };
}

export function finalizationUncertainError(): SafeChatExecutionError {
  return safeError(
    "service",
    "暂时无法确认请求结果，后台可能仍在执行。请只重新读取状态，勿重复发送或重新生成。",
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
