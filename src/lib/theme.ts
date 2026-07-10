export const THEME_COLOR_KEY = "penumbra-theme-color";

export interface ThemeColorPreset {
  name: string;
  value: string;
}

export const THEME_COLOR_PRESETS: ThemeColorPreset[] = [
  { name: "珊瑚", value: "#F4845F" },
  { name: "琥珀", value: "#D4924A" },
  { name: "落日", value: "#C4553A" },
  { name: "森林", value: "#4A8F6B" },
  { name: "海蓝", value: "#4A6FD4" },
  { name: "薰衣草", value: "#8B6BC4" },
  { name: "石墨", value: "#6B6560" },
  { name: "玫瑰", value: "#C44A6B" },
];

export const DEFAULT_THEME_COLOR = THEME_COLOR_PRESETS[0].value;

export function normalizeThemeColor(value: string): string | null {
  const normalized = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) return null;
  return normalized.toUpperCase();
}

function getThemeForeground(hex: string): "#FFFFFF" | "#111110" {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.64 ? "#111110" : "#FFFFFF";
}

export function applyThemeColor(value: string): string | null {
  const color = normalizeThemeColor(value);
  if (!color || typeof document === "undefined") return null;

  document.documentElement.style.setProperty("--color-theme", color);
  document.documentElement.style.setProperty(
    "--color-primary-foreground",
    getThemeForeground(color),
  );
  try {
    localStorage.setItem(THEME_COLOR_KEY, color);
  } catch {
    // 存储受限时仍保留本次页面内的主题预览。
  }
  return color;
}

export function getStoredThemeColor(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_COLOR;
  try {
    return normalizeThemeColor(localStorage.getItem(THEME_COLOR_KEY) ?? "") ?? DEFAULT_THEME_COLOR;
  } catch {
    return DEFAULT_THEME_COLOR;
  }
}
