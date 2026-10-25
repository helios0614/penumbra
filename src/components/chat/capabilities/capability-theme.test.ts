import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_COLOR_PRESETS, DEFAULT_AI_COLOR, DEFAULT_THEME_COLOR } from "@/lib/theme";

const css = readFileSync(new URL("../../../index.css", import.meta.url), "utf8");
const chatCss = readFileSync(new URL("../chat.css", import.meta.url), "utf8");
const light = css.split("@theme {")[1].split(".dark {")[0];
const dark = css.split(".dark {")[1].split("\n}")[0];
const hex = (source: string, name: string) => source.match(new RegExp(`${name}:\\s*(#[a-f0-9]{6})`, "i"))![1];
const rgb = (color: string) => [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
const mix = (first: number[], second: number[], weight: number) => first.map((v, i) => v * weight + second[i] * (1 - weight));
const luminance = (color: number[]) => color.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (first: number[], second: number[]) => {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};

describe("notification text contrast on the shared translucent AI surface", () => {
  it.each([light, dark])("keeps title, body and copy text readable across presets, defaults, fallback and extreme custom colors", theme => {
    // Read actual CSS weights/tokens so changing the design exercises the contrast budget.
    const alpha = Number(css.match(/--chat-ai-surface:[^;]+\) (\d+)%/)![1]) / 100;
    const titleWeight = Number(chatCss.match(/\.capability-title[^}]+\) (\d+)%/)![1]) / 100;
    const hoverAlpha = Number(chatCss.match(/button\.capability-header:hover[^}]+\) (\d+)%/)![1]) / 100;
    const focusWeight = Number(chatCss.match(/\.capability-header:focus-visible[^}]+\) (\d+)%/)![1]) / 100;
    const background = rgb(hex(theme, "--color-background"));
    const strong = rgb(hex(theme, "--color-muted-strong"));
    const muted = rgb(hex(theme, "--color-muted-foreground"));
    const colors = [...AI_COLOR_PRESETS.map(preset => preset.value), DEFAULT_AI_COLOR, DEFAULT_THEME_COLOR,
      hex(theme, "--color-theme"), ...(theme === dark ? [hex(theme, "--ai-theme-color")] : []), "#000000", "#FFFFFF", "#FFFF00"];
    for (const color of colors) {
      const accent = rgb(color), surface = mix(accent, background, alpha);
      const title = mix(strong, accent, titleWeight);
      const hoverSurface = mix(accent, surface, hoverAlpha), focus = mix(strong, accent, focusWeight);
      expect(contrast(title, background), `folded title ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(title, surface), `expanded title ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(strong, surface), `body ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, surface), `copy/labels ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(strong, hoverSurface), `technical toggle hover ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(focus, background), `folded focus edge ${color}`).toBeGreaterThanOrEqual(3);
      expect(contrast(focus, surface), `detail focus edge ${color}`).toBeGreaterThanOrEqual(3);
    }
  });
});
