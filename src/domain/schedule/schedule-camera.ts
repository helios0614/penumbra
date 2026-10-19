import { API_BASE_URL, apiGet, type ApiRequestOptions } from "@/lib/api";
import { resolveHttpUrl } from "@/lib/runtime-config";
import { ScheduleContractError } from "./schedule-types";

// The legacy /camera page owns device configuration; this feature only reads status.
export const cameraSettingsUrl = resolveHttpUrl(API_BASE_URL, "/camera");
export async function readScheduleCamera(options?: ApiRequestOptions): Promise<boolean> {
  const raw = await apiGet<unknown>("/api/cam/status", { ...options, cache: "no-store" });
  if (!raw || typeof raw !== "object" || !("camera_open" in raw) || typeof raw.camera_open !== "boolean") {
    throw new ScheduleContractError("摄像头状态格式异常。");
  }
  // monitoring / quiet hours describe the separate continuous-monitoring feature.
  return raw.camera_open;
}
