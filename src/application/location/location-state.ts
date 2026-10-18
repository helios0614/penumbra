import { ApiError } from "@/lib/api";
import { LocationBusinessError, type LocationConfig, type LocationStatus, type PoiSearchResult } from "@/domain/location";
import type { LocationDraft, LocationSaveSection } from "./location-draft";

export interface LocationState {
  readonly config: LocationConfig | null;
  readonly status: LocationStatus | null;
  readonly draft: LocationDraft | null;
  readonly baseline: LocationDraft | null;
  readonly replacementKey: string;
  readonly revealedKey: string | null;
  readonly configLoading: boolean;
  readonly statusLoading: boolean;
  readonly configError: string | null;
  readonly statusError: string | null;
  readonly pending: "save" | "save-position" | "save-key" | "set-home" | "clear-key" | "reveal-key" | "copy-key" | "search" | null;
  readonly feedback: { readonly error: boolean; readonly text: string; readonly section?: LocationSaveSection; readonly persistent?: boolean; readonly info?: boolean } | null;
  readonly validation: Partial<Record<keyof LocationDraft, string>>;
  readonly searchResult: PoiSearchResult | null;
  readonly searchError: string | null;
  readonly homeAwaitingReport: number | null;
  readonly dirty: boolean;
}
export const INITIAL_LOCATION_STATE: LocationState = {
  config: null, status: null, draft: null, baseline: null, replacementKey: "", revealedKey: null,
  configLoading: false, statusLoading: false, configError: null, statusError: null, pending: null,
  feedback: null, validation: {}, searchResult: null, searchError: null, homeAwaitingReport: null, dirty: false,
};
export function locationFailure(error: unknown): string {
  if (error instanceof LocationBusinessError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "登录状态不可用，请登录后重新读取。";
    if (error.status === 422) return "配置或凭据已变化，请重新读取后检查输入。";
    if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") return "连接中断或超时，未能确认结果，请刷新显示后检查。";
  }
  return "暂时无法完成操作，请重新读取后重试。";
}
