import { useSyncExternalStore } from "react";
import { applyAiColor, applyThemeColor, DEFAULT_THEME_MODE, syncThemeMode } from "@/lib/theme";
import { DEFAULT_WALLPAPER_SETTINGS } from "@/lib/wallpaper";
import { appearanceImageUrl, readAppearance, type AppearanceConfig } from "./appearance-client";

const DEFAULT_APPEARANCE: AppearanceConfig = {
  themeMode: DEFAULT_THEME_MODE,
  themeColor: null,
  aiColor: null,
  wallpaper: { ...DEFAULT_WALLPAPER_SETTINGS, image: null },
  avatars: { user: null, assistant: null },
  stickerImage: null,
  stickers: [{ id: "sticker-default", page: 1, position: { col: 0, row: 0 }, size: { cols: 1, rows: 1 } }],
};

interface AppearanceState {
  config: AppearanceConfig;
  status: "loading" | "ready" | "error";
  saving: boolean;
}

const initialState: AppearanceState = { config: DEFAULT_APPEARANCE, status: "loading", saving: false };
let state = initialState;
const listeners = new Set<() => void>();
let pendingRead: Promise<void> | undefined;
let writeQueue: Promise<unknown> = Promise.resolve();
let pendingWrites = 0;

function update(next: AppearanceState) {
  state = next;
  for (const listener of listeners) listener();
}

function publish(config: AppearanceConfig) {
  if (!config || typeof config !== "object" || !config.wallpaper || !config.avatars || !Array.isArray(config.stickers)) {
    throw new Error("无法读取服务端外观配置");
  }
  if (typeof document !== "undefined") {
    syncThemeMode(config.themeMode);
    applyThemeColor(config.themeColor);
    applyAiColor(config.aiColor);
  }
  update({ ...state, config, status: "ready" });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAppearance(): AppearanceState {
  return useSyncExternalStore(subscribe, () => state, () => initialState);
}

export function useAvatarImage(kind: "user" | "assistant"): string | null {
  const filename = useSyncExternalStore(subscribe, () => state.config.avatars[kind], () => null);
  return appearanceImageUrl(kind === "user" ? "user-avatar" : "assistant-avatar", filename);
}

export function loadAppearance(): Promise<void> {
  if (state.status === "ready") return Promise.resolve();
  if (pendingRead) return pendingRead;
  update({ ...state, status: "loading" });
  pendingRead = readAppearance().then(publish).catch(() => {
    update({ ...state, status: "error" });
  }).finally(() => { pendingRead = undefined; });
  return pendingRead;
}

export function startAppearance() {
  const refreshMode = () => syncThemeMode(state.config.themeMode);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refreshMode);
  refreshMode();
  void loadAppearance();
}

export async function saveAppearance(action: () => Promise<AppearanceConfig>): Promise<void> {
  if (state.status !== "ready") throw new Error("请先读取服务端外观配置");
  pendingWrites += 1;
  update({ ...state, saving: true });
  const write = writeQueue.then(action).then(publish);
  writeQueue = write.catch(() => undefined);
  try {
    await write;
  } finally {
    pendingWrites -= 1;
    if (pendingWrites === 0) update({ ...state, saving: false });
  }
}
