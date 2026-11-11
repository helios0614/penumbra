import { useId, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { normalizeThemeColor } from "@/lib/theme";

type Hsl = { hue: number; saturation: number; lightness: number };

const hueTrack = "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

function rgbToHex(channels: number[]): string {
  return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function parseColor(input: string): string | null {
  const hex = normalizeThemeColor(input);
  if (hex) return hex;

  const rgb = /^(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})$/.exec(input.trim());
  if (!rgb) return null;
  const channels = rgb.slice(1).map(Number);
  return channels.every(channel => channel <= 255) ? rgbToHex(channels) : null;
}

function hexToHsl(hex: string, fallbackHue = 0): Hsl {
  const [red, green, blue] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  const lightness = (max + min) / 2;
  if (chroma === 0) return { hue: fallbackHue, saturation: 0, lightness: lightness * 100 };

  const sector = max === red ? (green - blue) / chroma
    : max === green ? (blue - red) / chroma + 2 : (red - green) / chroma + 4;
  return {
    hue: (sector * 60 + 360) % 360,
    saturation: chroma / (1 - Math.abs(2 * lightness - 1)) * 100,
    lightness: lightness * 100,
  };
}

function hslToHex({ hue, saturation, lightness }: Hsl): string {
  const light = lightness / 100;
  const amplitude = saturation / 100 * Math.min(light, 1 - light);
  const channels = [0, 8, 4].map(offset => {
    const position = (offset + hue / 30) % 12;
    const wave = Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return Math.round((light - amplitude * wave) * 255);
  });
  return rgbToHex(channels);
}

export function ThemeColorDialog({ title, value, onApply, disabled }: {
  title: string;
  value: string;
  onApply: (value: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const [hsl, setHsl] = useState(() => hexToHsl(value));
  const [showError, setShowError] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const color = parseColor(input);
  const preview = color ?? hslToHex(hsl);
  const invalid = showError && !color;

  function updateChannel(channel: keyof Hsl, nextValue: number) {
    const next = { ...hsl, [channel]: nextValue };
    setHsl(next);
    setInput(hslToHex(next));
    setShowError(false);
  }

  const { hue, saturation, lightness } = hsl;
  const channels = [
    { key: "hue", label: "色相", max: 360, unit: "°", track: hueTrack },
    { key: "saturation", label: "饱和度", max: 100, unit: "%",
      track: `linear-gradient(to right, hsl(${hue} 0% ${lightness}%), hsl(${hue} 100% ${lightness}%))` },
    { key: "lightness", label: "亮度", max: 100, unit: "%",
      track: `linear-gradient(to right, #000, hsl(${hue} ${saturation}% 50%), #fff)` },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={nextOpen => {
      if (nextOpen) {
        setInput(value);
        setHsl(hexToHsl(value));
        setShowError(false);
        setSaveFailed(false);
      }
      setOpen(nextOpen);
    }}>
      <DialogTrigger aria-label={title} disabled={disabled} render={<Button type="button" variant="outline" size="lg" className="self-start" />}>
        <span className="size-5 rounded-full border border-border-strong/60" style={{ backgroundColor: value }} />
        自定义
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={async event => {
          event.preventDefault();
          if (disabled) return;
          if (!color) { setShowError(true); return; }
          setSaveFailed(false);
          if (await onApply(color)) setOpen(false);
          else setSaveFailed(true);
        }}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>输入色值，或拖动滑块调色。</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="grid shrink-0 gap-1.5 text-center">
                <span className="text-xs font-medium">预览</span>
                <span aria-hidden="true" className="size-11 rounded-xl border border-border-strong/60 shadow-sm"
                  style={{ backgroundColor: preview }} />
              </div>
              <div className="grid min-w-0 flex-1 gap-1.5">
                <label htmlFor={inputId} className="text-xs font-medium">色值</label>
                <Input id={inputId} surface="translucent" controlSize="comfortable" className="font-mono text-base"
                  value={input} autoComplete="off" autoCapitalize="off" spellCheck={false}
                  aria-invalid={invalid || undefined} aria-describedby={hintId}
                  onBlur={() => setShowError(true)} onChange={event => {
                    const text = event.currentTarget.value;
                    const nextColor = parseColor(text);
                    setInput(text);
                    if (nextColor) setHsl(previous => hexToHsl(nextColor, previous.hue));
                  }} />
                <p id={hintId} className={invalid ? "text-xs text-destructive-foreground" : "text-xs text-muted-foreground"}>
                  {invalid ? "输入 6 位 HEX 或三个 0–255 的 RGB 整数。" : "例如 #ffffff 或 255 255 255"}
                </p>
              </div>
            </div>
            <div className="space-y-0.5">
              {channels.map(({ key, label, max, unit, track }) => (
                <div key={key}>
                  <div aria-hidden="true" className="flex justify-between text-xs font-medium">
                    <span>{label}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round(hsl[key])}{unit}</span>
                  </div>
                  <Slider ariaLabel={label} max={max} value={Math.round(hsl[key])}
                    onValueChange={next => updateChannel(key, next)}
                    style={{ "--theme-picker-track": track } as CSSProperties}
                    className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:border [&_[data-slot=slider-track]]:border-border-strong/50 [&_[data-slot=slider-track]]:[background:var(--theme-picker-track)] [&_[data-slot=slider-indicator]]:hidden [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-neutral-800" />
                </div>
              ))}
            </div>
            {saveFailed && <p className="text-xs text-destructive" role="alert">保存颜色失败，请稍后重试。</p>}
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" size="comfortable" />}>取消</DialogClose>
            <Button type="submit" size="comfortable" disabled={disabled}>应用</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
