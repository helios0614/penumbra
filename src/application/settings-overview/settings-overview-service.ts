import {
  getAvailableModels,
  getChatReadiness,
  getSessionStatus,
} from "@/domain/runtime";
import { ApiError, type ApiRequestOptions } from "@/lib/api";

import type { SettingsOverview } from "@/application/settings-overview/settings-overview-types";

export async function loadSettingsOverview(
  options?: ApiRequestOptions,
): Promise<SettingsOverview> {
  try {
    const [session, models, readiness] = await Promise.all([
      getSessionStatus(options),
      getAvailableModels(options),
      getChatReadiness(undefined, options),
    ]);

    return { session, models, readiness };
  } catch (error) {
    if (error instanceof ApiError) {
      throw sanitizeApiError(error);
    }

    throw error;
  }
}

function sanitizeApiError(error: ApiError): ApiError {
  return new ApiError(
    safeApiErrorMessage(error),
    error.status,
    undefined,
    error.code,
  );
}

function safeApiErrorMessage(error: ApiError): string {
  if (error.code === "ABORTED") {
    return "Settings overview request aborted";
  }
  if (error.code === "TIMEOUT") {
    return "Settings overview request timed out";
  }
  if (error.code === "NETWORK_ERROR") {
    return "Unable to reach the backend";
  }
  if (error.code === "INVALID_RESPONSE") {
    return "Backend returned an invalid response";
  }
  if (error.status === 401 || error.status === 403) {
    return "Authentication is required";
  }

  return error.status > 0
    ? `Backend request failed with status ${error.status}`
    : "Backend request failed";
}
