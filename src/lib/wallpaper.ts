export type WallpaperMode = "ambient" | "custom";
export type WallpaperFit = "cover" | "contain";
export type WallpaperPosition = "top" | "center" | "bottom";
export type WallpaperShade = "clear" | "balanced" | "soft";
export type WallpaperTextTone = "auto" | "dark" | "light";

export interface WallpaperSettings {
  mode: WallpaperMode;
  fit: WallpaperFit;
  position: WallpaperPosition;
  shade: WallpaperShade;
  textTone: WallpaperTextTone;
}

export const DEFAULT_WALLPAPER_SETTINGS: WallpaperSettings = {
  mode: "ambient",
  fit: "cover",
  position: "center",
  shade: "balanced",
  textTone: "auto",
};

export function resolveWallpaperTextTone(tone: WallpaperTextTone): Exclude<WallpaperTextTone, "auto"> {
  if (tone !== "auto") return tone;
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "light" : "dark";
}
