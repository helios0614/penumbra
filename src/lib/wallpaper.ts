export const WALLPAPER_SETTINGS_KEY = "penumbra-wallpaper-settings";
export const WALLPAPER_CHANGE_EVENT = "penumbra-wallpaper-change";

const DB_NAME = "penumbra-preferences";
const DB_VERSION = 1;
const WALLPAPER_STORE = "wallpapers";
const DESKTOP_WALLPAPER_KEY = "desktop";

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

function isWallpaperMode(value: unknown): value is WallpaperMode {
  return value === "ambient" || value === "custom";
}

function isWallpaperFit(value: unknown): value is WallpaperFit {
  return value === "cover" || value === "contain";
}

function isWallpaperPosition(value: unknown): value is WallpaperPosition {
  return value === "top" || value === "center" || value === "bottom";
}

function isWallpaperShade(value: unknown): value is WallpaperShade {
  return value === "clear" || value === "balanced" || value === "soft";
}

function isWallpaperTextTone(value: unknown): value is WallpaperTextTone {
  return value === "auto" || value === "dark" || value === "light";
}

export function resolveWallpaperTextTone(tone: WallpaperTextTone): Exclude<WallpaperTextTone, "auto"> {
  if (tone !== "auto") return tone;
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "light" : "dark";
}

export function getStoredWallpaperSettings(): WallpaperSettings {
  if (typeof window === "undefined") return DEFAULT_WALLPAPER_SETTINGS;

  try {
    const parsed = JSON.parse(localStorage.getItem(WALLPAPER_SETTINGS_KEY) ?? "null") as Partial<WallpaperSettings> | null;
    if (!parsed) return DEFAULT_WALLPAPER_SETTINGS;

    return {
      mode: isWallpaperMode(parsed.mode) ? parsed.mode : DEFAULT_WALLPAPER_SETTINGS.mode,
      fit: isWallpaperFit(parsed.fit) ? parsed.fit : DEFAULT_WALLPAPER_SETTINGS.fit,
      position: isWallpaperPosition(parsed.position) ? parsed.position : DEFAULT_WALLPAPER_SETTINGS.position,
      shade: isWallpaperShade(parsed.shade) ? parsed.shade : DEFAULT_WALLPAPER_SETTINGS.shade,
      textTone: isWallpaperTextTone(parsed.textTone) ? parsed.textTone : DEFAULT_WALLPAPER_SETTINGS.textTone,
    };
  } catch {
    return DEFAULT_WALLPAPER_SETTINGS;
  }
}

export function saveWallpaperSettings(settings: WallpaperSettings): WallpaperSettings {
  if (typeof window === "undefined") return settings;

  try {
    localStorage.setItem(WALLPAPER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 存储受限时仍保留本次页面内的预览。
  }
  window.dispatchEvent(new CustomEvent(WALLPAPER_CHANGE_EVENT, { detail: settings }));
  return settings;
}

function openWallpaperDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持壁纸存储"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WALLPAPER_STORE)) {
        database.createObjectStore(WALLPAPER_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开壁纸存储"));
  });
}

function runWallpaperTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openWallpaperDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(WALLPAPER_STORE, mode);
    const request = operation(transaction.objectStore(WALLPAPER_STORE));
    let result: T;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error("壁纸存储操作失败"));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("壁纸存储事务失败"));
    };
  }));
}

export async function getCustomWallpaper(): Promise<Blob | null> {
  const result = await runWallpaperTransaction<Blob | undefined>(
    "readonly",
    (store) => store.get(DESKTOP_WALLPAPER_KEY),
  );
  return result ?? null;
}

export async function saveCustomWallpaper(file: Blob): Promise<void> {
  await runWallpaperTransaction<IDBValidKey>(
    "readwrite",
    (store) => store.put(file, DESKTOP_WALLPAPER_KEY),
  );
}

export async function removeCustomWallpaper(): Promise<void> {
  await runWallpaperTransaction<undefined>(
    "readwrite",
    (store) => store.delete(DESKTOP_WALLPAPER_KEY),
  );
}
