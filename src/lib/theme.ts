export const THEME_COLOR_KEY = "penumbra-theme-color";
export const AI_COLOR_KEY = "penumbra-ai-color";

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

export const AI_COLOR_PRESETS: ThemeColorPreset[] = [
  { name: "云蓝", value: "#7BA7BC" },
  { name: "青瓷", value: "#5F9E91" },
  { name: "鸢尾", value: "#7D73B5" },
  { name: "暮紫", value: "#956C9F" },
  { name: "海蓝", value: "#527FA8" },
  { name: "松绿", value: "#5C8A72" },
  { name: "暖杏", value: "#C98663" },
  { name: "石墨", value: "#6B7175" },
];

export const DEFAULT_THEME_COLOR = THEME_COLOR_PRESETS[0].value;
export const DEFAULT_AI_COLOR = AI_COLOR_PRESETS[0].value;

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

function getRelativeLuminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ));

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getContrastRatio(first: string, second: string): number {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function mixHex(color: string, target: string, amount: number): string {
  const channels = [1, 3, 5].map((start) => {
    const sourceChannel = Number.parseInt(color.slice(start, start + 2), 16);
    const targetChannel = Number.parseInt(target.slice(start, start + 2), 16);
    return Math.round(sourceChannel + (targetChannel - sourceChannel) * amount)
      .toString(16)
      .padStart(2, "0");
  });

  return `#${channels.join("")}`.toUpperCase();
}

function getReadableThemeInk(color: string, surface: string, target: string): string {
  const minimumContrast = 5.5;
  if (getContrastRatio(color, surface) >= minimumContrast) return color;

  for (let step = 1; step <= 25; step += 1) {
    const candidate = mixHex(color, target, step / 25);
    if (getContrastRatio(candidate, surface) >= minimumContrast) return candidate;
  }

  return target;
}

function applyThemeInk(color: string): void {
  document.documentElement.style.setProperty(
    "--theme-primary-ink-light",
    getReadableThemeInk(color, "#FAFAF8", "#1A1A1A"),
  );
  document.documentElement.style.setProperty(
    "--theme-primary-ink-dark",
    getReadableThemeInk(color, "#1A1A18", "#E8E8E4"),
  );
}

export function applyThemeColor(value: string): string | null {
  const color = normalizeThemeColor(value);
  if (!color || typeof document === "undefined") return null;

  document.documentElement.style.setProperty("--color-theme", color);
  document.documentElement.style.setProperty(
    "--color-primary-foreground",
    getThemeForeground(color),
  );
  applyThemeInk(color);
  try {
    localStorage.setItem(THEME_COLOR_KEY, color);
  } catch {
    // 存储受限时仍保留本次页面内的主题预览。
  }
  return color;
}

export function applyAiColor(value: string): string | null {
  const color = normalizeThemeColor(value);
  if (!color || typeof document === "undefined") return null;

  document.documentElement.style.setProperty("--ai-theme-color", color);
  document.documentElement.style.setProperty(
    "--ai-theme-foreground",
    getThemeForeground(color),
  );
  try {
    localStorage.setItem(AI_COLOR_KEY, color);
  } catch {
    // 存储受限时仍保留本次页面内的 AI 颜色预览。
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

export function getStoredAiColor(): string {
  if (typeof window === "undefined") return DEFAULT_AI_COLOR;
  try {
    return normalizeThemeColor(localStorage.getItem(AI_COLOR_KEY) ?? "") ?? DEFAULT_AI_COLOR;
  } catch {
    return DEFAULT_AI_COLOR;
  }
}
