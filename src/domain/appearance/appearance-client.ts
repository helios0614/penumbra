import { apiGet, apiRequest, API_BASE_URL, ApiError } from "@/lib/api";
import { resolveHttpUrl } from "@/lib/runtime-config";
import type { ThemeMode } from "@/lib/theme";
import type { WallpaperSettings } from "@/lib/wallpaper";
import type { WidgetPosition, WidgetSize } from "@/widgets/types";

const ENDPOINT = "/api/appearance";
const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const APPEARANCE_IMAGE_ACCEPT = imageTypes.join(",");
export const APPEARANCE_IMAGE_FORMATS = "JPEG、PNG、GIF 或 WebP";
const UPLOAD_LIMIT = 20 * 1024 * 1024;

export type AppearanceImageSlot = "user-avatar" | "assistant-avatar" | "wallpaper" | "sticker";

export interface StickerPlacement {
  page: 0 | 1;
  position: WidgetPosition;
  size: WidgetSize;
}

export interface DesktopSticker extends StickerPlacement {
  id: string;
}

export interface AppearanceConfig {
  themeMode: ThemeMode;
  themeColor: string | null;
  aiColor: string | null;
  wallpaper: WallpaperSettings & { image: string | null };
  avatars: { user: string | null; assistant: string | null };
  stickerImage: string | null;
  stickers: DesktopSticker[];
}

export interface AppearancePatch {
  themeMode?: ThemeMode;
  themeColor?: string;
  aiColor?: string;
  wallpaper?: Partial<WallpaperSettings>;
}

export function readAppearance(): Promise<AppearanceConfig> {
  return apiGet<AppearanceConfig>(ENDPOINT, { cache: "no-store" });
}

export function patchAppearance(patch: AppearancePatch): Promise<AppearanceConfig> {
  return apiRequest(ENDPOINT, { method: "PATCH", body: { ...patch } });
}

export function putSticker(id: string, placement: StickerPlacement): Promise<AppearanceConfig> {
  return apiRequest(`${ENDPOINT}/stickers/${encodeURIComponent(id)}`, { method: "PUT", body: { ...placement } });
}

export function deleteSticker(id: string): Promise<AppearanceConfig> {
  return apiRequest(`${ENDPOINT}/stickers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function resetStickers(): Promise<AppearanceConfig> {
  return apiRequest(`${ENDPOINT}/stickers/reset`, { method: "POST" });
}

export function appearanceImageUrl(slot: AppearanceImageSlot, name: string | null): string | null {
  if (!name || !/^[a-f0-9]{32}\.(jpg|png|gif|webp)$/.test(name)) return null;
  return resolveHttpUrl(API_BASE_URL, `${ENDPOINT}/images/${slot}/${name}`);
}

export async function uploadAppearanceImage(slot: AppearanceImageSlot, file: File): Promise<AppearanceConfig> {
  if (file.type && !imageTypes.includes(file.type)) {
    throw new Error(`请选择 ${APPEARANCE_IMAGE_FORMATS} 图片`);
  }
  if (file.size > UPLOAD_LIMIT) throw new Error("图片请不要超过 20 MB");
  const form = new FormData();
  form.append("file", file);
  try {
    return await apiRequest(`${ENDPOINT}/images/${slot}`, { method: "PUT", body: form, timeoutMs: 300_000 });
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      const data = error.data as { detail?: unknown } | null;
      if (typeof data?.detail === "string") throw new Error(data.detail);
    }
    throw error;
  }
}

export function deleteAppearanceImage(slot: AppearanceImageSlot): Promise<AppearanceConfig> {
  return apiRequest(`${ENDPOINT}/images/${slot}`, { method: "DELETE" });
}

export function appearanceSaveError(error: unknown, fallback: string): string {
  return error instanceof Error && !(error instanceof ApiError) ? error.message : fallback;
}
