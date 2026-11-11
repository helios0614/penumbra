import { useRef, type ChangeEvent } from "react";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { APPEARANCE_IMAGE_ACCEPT, appearanceImageUrl, type AppearanceConfig } from "@/domain/appearance/appearance-client";
import { cn } from "@/lib/utils";
import type { WallpaperSettings } from "@/lib/wallpaper";
import { SettingsSectionHeading } from "./SettingsSectionHeading";

export function AppearanceWallpaper({ wallpaperSettings, onPatch, onUpload, onRemove }: {
  wallpaperSettings: AppearanceConfig["wallpaper"];
  onPatch: (patch: Partial<WallpaperSettings>) => Promise<boolean>;
  onUpload: (file: File) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const wallpaperPreview = appearanceImageUrl("wallpaper", wallpaperSettings.image);
  const hasCustomWallpaper = Boolean(wallpaperPreview);

  function updateWallpaperSettings(patch: Partial<WallpaperSettings>) {
    void onPatch(patch);
  }

  function selectWallpaperMode(mode: WallpaperSettings["mode"]) {
    if (mode === "custom" && !hasCustomWallpaper) wallpaperInputRef.current?.click();
    else updateWallpaperSettings({ mode });
  }

  function chooseWallpaper(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void onUpload(file);
  }

  return (
    <div className="mist-glass rounded-[24px] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SettingsSectionHeading
          title="桌面背景"
          description="使用 Penumbra 氛围背景，或上传一张 JPEG、PNG、GIF 或 WebP 图片（最大 20 MB）。"
        />
        <div className="inline-flex self-start rounded-full border border-border-strong/50 bg-background/25 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => selectWallpaperMode("ambient")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              wallpaperSettings.mode === "ambient" ? "bg-primary text-primary-foreground" : "text-muted-strong hover:bg-white/35 dark:hover:bg-white/10",
            )}
          >
            氛围背景
          </button>
          <button
            type="button"
            onClick={() => selectWallpaperMode("custom")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              wallpaperSettings.mode === "custom" ? "bg-primary text-primary-foreground" : "text-muted-strong hover:bg-white/35 dark:hover:bg-white/10",
            )}
          >
            自定义壁纸
          </button>
        </div>
      </div>

      <input
        ref={wallpaperInputRef}
        type="file"
        accept={APPEARANCE_IMAGE_ACCEPT}
        onChange={chooseWallpaper}
        className="hidden"
        aria-label="选择自定义壁纸"
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(250px,0.75fr)]">
        <div
          className={cn(
            "desktop-wallpaper-preview relative min-h-48 overflow-hidden rounded-[20px] border border-border-strong/60 bg-surface-secondary shadow-inner",
            !wallpaperPreview && "desktop-wallpaper",
          )}
          data-wallpaper-text={wallpaperSettings.textTone}
          style={wallpaperPreview ? {
            backgroundImage: `url(${JSON.stringify(wallpaperPreview)})`,
            backgroundPosition: wallpaperSettings.position,
            backgroundSize: wallpaperSettings.fit,
          } : undefined}
        >
          <div className="desktop-wallpaper-overlay absolute inset-0" data-preview-shade={wallpaperSettings.shade} />
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-3 py-2 shadow-sm backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-ink">Penumbra</p>
              <p className="desktop-on-wallpaper mt-0.5 text-sm font-semibold">桌面预览</p>
            </div>
            <span className="desktop-on-wallpaper grid size-11 place-items-center rounded-[15px] border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] shadow-sm backdrop-blur-xl">
              <ImageIcon className="size-5" />
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => wallpaperInputRef.current?.click()}
              
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50"
            >
              <Upload className="size-4" />
              {hasCustomWallpaper ? "替换图片" : "选择图片"}
            </button>
            <button
              type="button"
              onClick={() => void onRemove()}
              disabled={!hasCustomWallpaper}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border-strong/50 bg-background/35 px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-background/55 disabled:opacity-40"
            >
              <Trash2 className="size-4" />
              移除
            </button>
          </div>

          <SettingChoice
            label="显示方式"
            value={wallpaperSettings.fit}
            options={[{ value: "cover", label: "填充" }, { value: "contain", label: "适应" }]}
            onChange={(value) => updateWallpaperSettings({ fit: value as WallpaperSettings["fit"] })}
          />
          <SettingChoice
            label="图片位置"
            value={wallpaperSettings.position}
            options={[{ value: "top", label: "顶部" }, { value: "center", label: "居中" }, { value: "bottom", label: "底部" }]}
            onChange={(value) => updateWallpaperSettings({ position: value as WallpaperSettings["position"] })}
          />
          <SettingChoice
            label="界面柔和度"
            value={wallpaperSettings.shade}
            options={[{ value: "clear", label: "清晰" }, { value: "balanced", label: "平衡" }, { value: "soft", label: "柔和" }]}
            onChange={(value) => updateWallpaperSettings({ shade: value as WallpaperSettings["shade"] })}
          />
          <SettingChoice
            label="桌面文字"
            value={wallpaperSettings.textTone}
            options={[
              { value: "auto", label: "自动" },
              { value: "dark", label: "黑色" },
              { value: "light", label: "白色" },
            ]}
            onChange={(value) => updateWallpaperSettings({ textTone: value as WallpaperSettings["textTone"] })}
          />
        </div>
      </div>

    </div>
  );
}

function SettingChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-muted-strong">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              value === option.value
                ? "bg-primary/15 text-primary-ink"
                : "bg-white/35 text-muted-strong hover:bg-white/60 dark:bg-white/5 dark:hover:bg-white/10",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

