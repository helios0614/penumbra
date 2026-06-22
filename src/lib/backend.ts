import { API_BASE_URL_DISPLAY, ApiError, apiGet } from "@/lib/api";

export const BACKEND_STATUS_ENDPOINT = "/api/settings";

export type ConnectionState = "checking" | "connected" | "failed";
export type LoginState = "logged-in" | "logged-out" | "unknown";

export interface BackendStatus {
  connection: ConnectionState;
  login: LoginState;
  apiBaseUrl: string;
  endpoint: string;
  checkedAt: number | null;
  message?: string;
}

export const INITIAL_BACKEND_STATUS: BackendStatus = {
  connection: "checking",
  login: "unknown",
  apiBaseUrl: API_BASE_URL_DISPLAY,
  endpoint: BACKEND_STATUS_ENDPOINT,
  checkedAt: null,
};

export async function checkBackendStatus(): Promise<BackendStatus> {
  const checkedAt = Date.now();

  try {
    await apiGet<Record<string, unknown>>(BACKEND_STATUS_ENDPOINT);

    return {
      connection: "connected",
      login: "logged-in",
      apiBaseUrl: API_BASE_URL_DISPLAY,
      endpoint: BACKEND_STATUS_ENDPOINT,
      checkedAt,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return {
        connection: "connected",
        login: "logged-out",
        apiBaseUrl: API_BASE_URL_DISPLAY,
        endpoint: BACKEND_STATUS_ENDPOINT,
        checkedAt,
        message: error.message,
      };
    }

    return {
      connection: "failed",
      login: "unknown",
      apiBaseUrl: API_BASE_URL_DISPLAY,
      endpoint: BACKEND_STATUS_ENDPOINT,
      checkedAt,
      message: error instanceof Error ? error.message : "Unable to reach backend",
    };
  }
}
