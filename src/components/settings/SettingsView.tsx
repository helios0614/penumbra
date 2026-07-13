import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Image as ImageIcon,
  LogIn,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  INITIAL_BACKEND_STATUS,
  checkBackendStatus,
  type BackendStatus,
  type ConnectionState,
  type LoginState,
} from "@/lib/backend";
import { cn } from "@/lib/utils";
import {
  applyThemeColor,
  getStoredThemeColor,
  THEME_COLOR_PRESETS,
} from "@/lib/theme";
import {
  getCustomWallpaper,
  getStoredWallpaperSettings,
  removeCustomWallpaper,
  saveCustomWallpaper,
  saveWallpaperSettings,
  type WallpaperSettings,
} from "@/lib/wallpaper";

interface SettingsViewProps {
  onBack?: () => void;
}

const connectionCopy: Record<ConnectionState, string> = {
  checking: "连接中",
  connected: "已连接",
  failed: "连接失败",
};

const loginCopy: Record<LoginState, string> = {
  "logged-in": "已登录",
  "logged-out": "未登录",
  unknown: "未知",
};

export function SettingsView({ onBack }: SettingsViewProps) {
  const [status, setStatus] = useState<BackendStatus>(INITIAL_BACKEND_STATUS);
  const [themeColor, setThemeColor] = useState(getStoredThemeColor);
  const [wallpaperSettings, setWallpaperSettings] = useState(getStoredWallpaperSettings);
  const [wallpaperPreview, setWallpaperPreview] = useState<string | null>(null);
  const [hasCustomWallpaper, setHasCustomWallpaper] = useState(false);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [isSavingWallpaper, setIsSavingWallpaper] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const wallpaperPreviewRef = useRef<string | null>(null);

  const selectThemeColor = useCallback((color: string) => {
    const applied = applyThemeColor(color);
    if (applied) setThemeColor(applied);
  }, []);

  const refresh = useCallback(async () => {
    setStatus((current) => ({
      ...current,
      connection: "checking",
      login: "unknown",
      message: undefined,
    }));
    setStatus(await checkBackendStatus());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let disposed = false;

    getCustomWallpaper()
      .then((wallpaper) => {
        if (disposed || !wallpaper) return;
        const previewUrl = URL.createObjectURL(wallpaper);
        wallpaperPreviewRef.current = previewUrl;
        setWallpaperPreview(previewUrl);
        setHasCustomWallpaper(true);
      })
      .catch(() => setWallpaperError("无法读取已保存的壁纸"));

    return () => {
      disposed = true;
      if (wallpaperPreviewRef.current) URL.revokeObjectURL(wallpaperPreviewRef.current);
    };
  }, []);

  const updateWallpaperSettings = useCallback((patch: Partial<WallpaperSettings>) => {
    const next = { ...getStoredWallpaperSettings(), ...patch };
    setWallpaperSettings(next);
    saveWallpaperSettings(next);
  }, []);

  const selectWallpaperMode = useCallback((mode: WallpaperSettings["mode"]) => {
    if (mode === "custom" && !hasCustomWallpaper) {
      wallpaperInputRef.current?.click();
      return;
    }
    updateWallpaperSettings({ mode });
  }, [hasCustomWallpaper, updateWallpaperSettings]);

  const chooseWallpaper = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setWallpaperError("请选择图片文件");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setWallpaperError("壁纸文件请不要超过 20 MB");
      return;
    }

    setIsSavingWallpaper(true);
    setWallpaperError(null);
    try {
      await saveCustomWallpaper(file);
      const previewUrl = URL.createObjectURL(file);
      if (wallpaperPreviewRef.current) URL.revokeObjectURL(wallpaperPreviewRef.current);
      wallpaperPreviewRef.current = previewUrl;
      setWallpaperPreview(previewUrl);
      setHasCustomWallpaper(true);
      updateWallpaperSettings({ mode: "custom" });
    } catch {
      setWallpaperError("保存壁纸失败，请稍后重试");
    } finally {
      setIsSavingWallpaper(false);
    }
  }, [updateWallpaperSettings]);

  const clearWallpaper = useCallback(async () => {
    setIsSavingWallpaper(true);
    setWallpaperError(null);
    try {
      await removeCustomWallpaper();
      if (wallpaperPreviewRef.current) URL.revokeObjectURL(wallpaperPreviewRef.current);
      wallpaperPreviewRef.current = null;
      setWallpaperPreview(null);
      setHasCustomWallpaper(false);
      updateWallpaperSettings({ mode: "ambient" });
    } catch {
      setWallpaperError("移除壁纸失败，请稍后重试");
    } finally {
      setIsSavingWallpaper(false);
    }
  }, [updateWallpaperSettings]);

  const isChecking = status.connection === "checking";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      <div className="mist-glass rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Settings
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">设置</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              后端连接状态和基础配置入口。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={isChecking}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background shadow-sm",
                "transition hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <RefreshCw className={cn("size-4", isChecking && "animate-spin")} />
              重新检测连接
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mist-glass grid size-10 place-items-center rounded-full text-foreground transition-colors hover:bg-white/75 dark:hover:bg-white/15"
                title="返回桌面"
              >
                <XCircle className="size-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mist-glass rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">桌面背景</p>
            <p className="mt-1 text-xs text-muted-foreground">
              使用 Penumbra 氛围背景，或者选择一张保存在当前设备上的图片。
            </p>
          </div>
          <div className="mist-glass inline-flex self-start rounded-full p-1">
            <button
              type="button"
              onClick={() => selectWallpaperMode("ambient")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                wallpaperSettings.mode === "ambient" ? "bg-foreground text-background" : "text-muted-strong hover:bg-white/35 dark:hover:bg-white/10",
              )}
            >
              氛围背景
            </button>
            <button
              type="button"
              onClick={() => selectWallpaperMode("custom")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                wallpaperSettings.mode === "custom" ? "bg-foreground text-background" : "text-muted-strong hover:bg-white/35 dark:hover:bg-white/10",
              )}
            >
              自定义壁纸
            </button>
          </div>
        </div>

        <input
          ref={wallpaperInputRef}
          type="file"
          accept="image/*"
          onChange={chooseWallpaper}
          className="hidden"
          aria-label="选择自定义壁纸"
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(250px,0.75fr)]">
          <div
            className={cn(
              "relative min-h-48 overflow-hidden rounded-[20px] border border-white/35 bg-surface-secondary shadow-inner",
              !wallpaperPreview && "desktop-wallpaper",
            )}
            style={wallpaperPreview ? {
              backgroundImage: `url(${JSON.stringify(wallpaperPreview)})`,
              backgroundPosition: wallpaperSettings.position,
              backgroundSize: wallpaperSettings.fit,
            } : undefined}
          >
            <div className="desktop-wallpaper-overlay absolute inset-0" data-preview-shade={wallpaperSettings.shade} />
            <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
              <div className="rounded-2xl border border-white/45 bg-white/45 px-3 py-2 shadow-sm backdrop-blur-xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Penumbra</p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-900">桌面预览</p>
              </div>
              <span className="grid size-11 place-items-center rounded-[15px] border border-white/55 bg-white/40 text-neutral-900 shadow-sm backdrop-blur-xl">
                <ImageIcon className="size-5" />
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => wallpaperInputRef.current?.click()}
                disabled={isSavingWallpaper}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
              >
                <Upload className="size-4" />
                {hasCustomWallpaper ? "替换图片" : "选择图片"}
              </button>
              <button
                type="button"
                onClick={clearWallpaper}
                disabled={!hasCustomWallpaper || isSavingWallpaper}
                className="mist-solid inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium text-foreground disabled:opacity-40"
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
          </div>
        </div>

        {wallpaperError && <p className="mt-3 text-xs text-destructive">{wallpaperError}</p>}
      </div>

      <div className="mist-glass rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">主题颜色</p>
            <p className="mt-1 text-xs text-muted-foreground">
              桌面 App 图标、按钮和强调色会一起更新。
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            自定义
            <input
              type="color"
              value={themeColor}
              onChange={(event) => selectThemeColor(event.target.value)}
              className="size-10 cursor-pointer rounded-xl border border-border bg-transparent p-1"
              aria-label="自定义主题颜色"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-8">
          {THEME_COLOR_PRESETS.map((preset) => {
            const isSelected = preset.value.toUpperCase() === themeColor;

            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => selectThemeColor(preset.value)}
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
                  {isSelected && <Check className="size-4 text-white drop-shadow-sm" />}
                </span>
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatusPanel
          icon={<Server className="size-5" />}
          label="后端连接状态"
          value={connectionCopy[status.connection]}
          tone={status.connection}
        />
        <StatusPanel
          icon={<LogIn className="size-5" />}
          label="登录状态"
          value={loginCopy[status.login]}
          tone={status.login === "logged-in" ? "connected" : status.login === "logged-out" ? "failed" : "checking"}
        />
        <StatusPanel
          icon={<CircleDashed className="size-5" />}
          label="检测接口"
          value={status.endpoint}
          tone="checking"
          mono
        />
      </div>

      <div className="mist-glass rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">当前 API Base URL</span>
          <code className="overflow-x-auto rounded-xl bg-surface-secondary px-3 py-2 text-xs text-muted-strong">
            {status.apiBaseUrl}
          </code>
          {status.checkedAt && (
            <span className="text-xs text-muted-foreground">
              最近检测：{new Date(status.checkedAt).toLocaleString()}
            </span>
          )}
          {status.message && (
            <span className="text-xs text-muted-foreground">
              返回信息：{status.message}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <PlaceholderSection title="模型设置" />
        <PlaceholderSection title="Chat 设置" />
        <PlaceholderSection title="日历设置" />
      </div>
    </div>
  );
}

function StatusPanel({
  icon,
  label,
  value,
  tone,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: ConnectionState;
  mono?: boolean;
}) {
  const Icon = tone === "connected" ? CheckCircle2 : tone === "failed" ? XCircle : CircleDashed;

  return (
    <div className="mist-glass rounded-[22px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <Icon
          className={cn(
            "size-5 shrink-0",
            tone === "connected" && "text-success",
            tone === "failed" && "text-destructive",
            tone === "checking" && "text-muted-foreground",
          )}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-base font-semibold text-foreground",
          mono && "font-mono text-sm",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div className="mist-glass rounded-[22px] border-dashed border-border-strong p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        {title}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">预留区块，后续按确认接口接入。</p>
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
                ? "bg-primary/15 text-primary"
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

export default SettingsView;
