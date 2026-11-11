import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_COLOR_PRESETS, DEFAULT_AI_COLOR, DEFAULT_THEME_COLOR, THEME_COLOR_PRESETS, type ThemeMode } from "@/lib/theme";
import {
  appearanceSaveError, deleteAppearanceImage, patchAppearance, uploadAppearanceImage,
  type AppearanceConfig, type AppearanceImageSlot, type AppearancePatch,
} from "@/domain/appearance/appearance-client";
import { loadAppearance, saveAppearance, useAppearance } from "@/domain/appearance/appearance-store";
import { Button } from "@/components/ui/button";
import { AppearanceAvatars } from "./AppearanceAvatars";
import { AppearanceWallpaper } from "./AppearanceWallpaper";
import { SettingsSectionHeading } from "./SettingsSectionHeading";
import { ThemeColorDialog } from "./ThemeColorDialog";

const themeModeOptions = [
  { value: "system", label: "跟随系统", description: "随设备外观自动切换", icon: Monitor },
  { value: "light", label: "浅色", description: "保持明亮的晨雾界面", icon: Sun },
  { value: "dark", label: "深色", description: "保持低亮度的夜间界面", icon: Moon },
] satisfies Array<{
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Monitor;
}>;

export function SettingsAppearance() {
  const { config, status, saving } = useAppearance();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { themeMode, wallpaper, avatars } = config;
  const themeColor = config.themeColor ?? DEFAULT_THEME_COLOR;
  const aiColor = config.aiColor ?? DEFAULT_AI_COLOR;
  const disabled = status !== "ready" || saving;

  async function save(action: () => Promise<AppearanceConfig>, fallback: string): Promise<boolean> {
    setSaveError(null);
    try {
      await saveAppearance(action);
      return true;
    } catch (error) {
      setSaveError(appearanceSaveError(error, fallback));
      return false;
    }
  }

  const savePatch = (patch: AppearancePatch) => save(() => patchAppearance(patch), "保存外观失败，请稍后重试");
  const upload = (slot: AppearanceImageSlot, file: File) => save(() => uploadAppearanceImage(slot, file), "保存图片失败，请稍后重试");
  const remove = (slot: AppearanceImageSlot) => save(() => deleteAppearanceImage(slot), "移除图片失败，请稍后重试");

  useEffect(() => {
    if (!saving) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [saving]);

  return (
    <div className="space-y-4">
      {status === "error" && (
        <div className="flex flex-wrap items-center gap-3 text-sm" role="alert">
          <span>无法读取服务端外观配置。</span>
          <Button type="button" variant="outline" onClick={() => void loadAppearance()}>重试</Button>
        </div>
      )}
      {status === "loading" && <p className="text-sm text-muted-foreground" role="status">正在读取外观配置…</p>}
      {saving && <p className="text-sm text-muted-foreground" role="status">正在保存外观配置…</p>}
      {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
      <fieldset disabled={disabled} className="min-w-0 space-y-4">
        <legend className="sr-only">外观设置</legend>
        <div className="mist-glass rounded-[24px] p-4 sm:p-5">
          <SettingsSectionHeading
            title="界面外观"
            description="选择固定外观，或根据设备的浅色与深色设置自动切换。"
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="界面外观">
            {themeModeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = themeMode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => void savePatch({ themeMode: option.value })}
                  className={cn(
                    "flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition-all",
                    isSelected
                      ? "border-primary/45 bg-primary/12 text-foreground shadow-sm"
                      : "border-border-strong/60 bg-background/25 text-muted-strong hover:bg-background/45",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-surface-secondary text-muted-strong",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>


        <AppearanceAvatars avatars={avatars} onUpload={upload} onRemove={remove} />

        <AppearanceWallpaper wallpaperSettings={wallpaper} onPatch={patch => savePatch({ wallpaper: patch })}
          onUpload={file => upload("wallpaper", file)} onRemove={() => remove("wallpaper")} />

        <div className="mist-glass rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SettingsSectionHeading
              title="主题颜色"
              description="桌面 App 图标、按钮和强调色会一起更新。"
            />
            <ThemeColorDialog title="自定义主题颜色" value={themeColor} onApply={color => savePatch({ themeColor: color })} disabled={disabled} />
          </div>

          <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-8">
            {THEME_COLOR_PRESETS.map((preset) => {
              const isSelected = preset.value.toUpperCase() === themeColor;

              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => void savePatch({ themeColor: preset.value })}
                  className="group flex flex-col items-center gap-1.5 text-[11px] text-muted-foreground"
                  aria-label={`使用${preset.name}主题`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full border-2 shadow-sm transition-transform group-hover:scale-105",
                      isSelected ? "border-foreground" : "border-white/70 dark:border-white/15",
                    )}
                    style={{ backgroundColor: preset.value }}
                  >
                    {isSelected && <Check className="size-4 text-primary-foreground drop-shadow-sm" />}
                  </span>
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mist-glass rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SettingsSectionHeading
              title="AI 主题色"
              description="AI 头像、名称、消息气泡和思考状态会一起更新。"
            />
            <div className="flex items-center gap-3">
              <div
                className="flex max-w-48 items-start gap-2 rounded-xl border border-ai/20 bg-ai/10 px-3 py-2 text-ai shadow-sm"
                aria-label="AI 气泡颜色预览"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-current" />
                <span className="text-xs font-medium leading-relaxed">你好，我是 Aion</span>
              </div>
              <ThemeColorDialog title="自定义 AI 主题色" value={aiColor} onApply={color => savePatch({ aiColor: color })} disabled={disabled} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-8">
            {AI_COLOR_PRESETS.map((preset) => {
              const isSelected = preset.value.toUpperCase() === aiColor;

              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => void savePatch({ aiColor: preset.value })}
                  className="group flex flex-col items-center gap-1.5 text-[11px] text-muted-foreground"
                  aria-label={`使用${preset.name} AI 主题`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full border-2 shadow-sm transition-transform group-hover:scale-105",
                      isSelected ? "border-foreground" : "border-white/70 dark:border-white/15",
                    )}
                    style={{ backgroundColor: preset.value }}
                  >
                    {isSelected && <Check className="size-4 text-ai-foreground drop-shadow-sm" />}
                  </span>
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
