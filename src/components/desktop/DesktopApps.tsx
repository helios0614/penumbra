import { Settings } from "lucide-react";
import {
  DESKTOP_APP_META,
  type DesktopAppId,
} from "@/components/apps/DesktopAppView";

const SHORTCUTS: DesktopAppId[] = [
  "chat",
  "calendar",
  "todo",
  "notes",
  "music",
  "weather",
  "clock",
];

export function DesktopApps({
  onLaunch,
  onSettings,
}: {
  onLaunch: (appId: DesktopAppId) => void;
  onSettings: () => void;
}) {
  return (
    <section className="desktop-apps" aria-labelledby="desktop-apps-title">
      <h2 id="desktop-apps-title" className="sr-only">常用空间</h2>

      <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-8 sm:gap-x-4">
        {SHORTCUTS.map((appId) => {
          const app = DESKTOP_APP_META[appId];
          const Icon = app.icon;
          return (
            <button
              key={appId}
              type="button"
              onClick={() => onLaunch(appId)}
              className="desktop-shortcut group flex min-w-0 flex-col items-center text-center"
              aria-label={`打开${app.name}`}
            >
              <span className="desktop-shortcut-tile mist-glass grid aspect-square w-full max-w-[76px] place-items-center rounded-[20px] sm:max-w-[82px]">
                <Icon className="size-7 sm:size-8" strokeWidth={1.8} />
              </span>
              <span className="desktop-shortcut-label mt-1.5 block max-w-full truncate px-1 text-[11px] font-medium sm:text-xs">
                {app.name}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onSettings}
          className="desktop-shortcut group flex min-w-0 flex-col items-center text-center"
          aria-label="打开设置"
        >
          <span className="desktop-shortcut-tile mist-glass grid aspect-square w-full max-w-[76px] place-items-center rounded-[20px] sm:max-w-[82px]">
            <Settings className="size-7 sm:size-8" strokeWidth={1.8} />
          </span>
          <span className="desktop-shortcut-label mt-1.5 block max-w-full truncate px-1 text-[11px] font-medium sm:text-xs">
            设置
          </span>
        </button>
      </div>
    </section>
  );
}

export default DesktopApps;
