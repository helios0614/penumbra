import { getSessionStatus, SESSION_ENDPOINT } from "@/domain/runtime";
import { API_BASE_URL_DISPLAY, ApiError } from "@/lib/api";

export const BACKEND_STATUS_ENDPOINT = SESSION_ENDPOINT;

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
    const session = await getSessionStatus();

    return {
      connection: "connected",
      login: session.status === "authenticated" ? "logged-in" : "logged-out",
      apiBaseUrl: API_BASE_URL_DISPLAY,
      endpoint: BACKEND_STATUS_ENDPOINT,
      checkedAt,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status > 0) {
      return {
        connection: "connected",
        login: "unknown",
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
