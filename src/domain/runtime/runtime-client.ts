import {
  mapAvailableModels,
  mapChatReadiness,
  mapSessionStatus,
} from "@/domain/runtime/runtime-mappers";
import type {
  AvailableModel,
  ChatReadiness,
  SessionState,
} from "@/domain/runtime/runtime-types";
import { ApiError, apiGet, type ApiRequestOptions } from "@/lib/api";

export const SESSION_ENDPOINT = "/api/session";
export const MODELS_ENDPOINT = "/api/models";
export const CHAT_READINESS_ENDPOINT = "/api/chat/readiness";

export async function getSessionStatus(options?: ApiRequestOptions): Promise<SessionState> {
  try {
    return mapSessionStatus(await apiGet<unknown>(SESSION_ENDPOINT, options));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { status: "unauthenticated" };
    }
    throw error;
  }
}

export async function getAvailableModels(options?: ApiRequestOptions): Promise<AvailableModel[]> {
  return mapAvailableModels(await apiGet<unknown>(MODELS_ENDPOINT, options));
}

export async function getChatReadiness(
  conversationId?: string,
  options?: ApiRequestOptions,
): Promise<ChatReadiness> {
  let path = CHAT_READINESS_ENDPOINT;
  if (conversationId !== undefined) {
    path = `${path}?${new URLSearchParams({ conv_id: conversationId }).toString()}`;
  }
  return mapChatReadiness(await apiGet<unknown>(path, { ...options, cache: "no-store" }));
}
