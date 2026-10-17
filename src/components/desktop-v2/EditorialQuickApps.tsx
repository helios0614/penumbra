import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  CloudSun,
  MessageCircle,
  Music2,
  Settings,
  StickyNote,
  NotebookPen,
  History,
  type LucideIcon,
} from "lucide-react";
import type { DesktopAppId } from "@/components/apps/DesktopAppView";

interface EditorialShortcut {
  id: DesktopAppId | "settings";
  label: string;
  caption: string;
  icon: LucideIcon;
}

const SHORTCUTS: EditorialShortcut[] = [
  { id: "chat", label: "对话", caption: "Chat", icon: MessageCircle },
  { id: "calendar", label: "日程", caption: "Calendar", icon: CalendarDays },
  { id: "todo", label: "待办", caption: "Focus", icon: CheckCircle2 },
  { id: "notes", label: "日记", caption: "Journal", icon: StickyNote },
  { id: "quick-notes", label: "速记", caption: "Quick Notes", icon: NotebookPen },
  { id: "activity", label: "活动日志", caption: "Activity Log", icon: History },
  { id: "music", label: "音乐", caption: "Listen", icon: Music2 },
  { id: "weather", label: "天气", caption: "Outside", icon: CloudSun },
  { id: "clock", label: "时钟", caption: "Time", icon: Clock3 },
  { id: "settings", label: "设置", caption: "Settings", icon: Settings },
];

export function EditorialQuickApps({
  onLaunch,
  onSettings,
}: {
  onLaunch: (appId: DesktopAppId) => void;
  onSettings: () => void;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Desk tools</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">常用空间</h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">10 essentials</span>
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-5 sm:gap-x-3">
        {SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <button
              key={shortcut.id}
              type="button"
              onClick={() => shortcut.id === "settings" ? onSettings() : onLaunch(shortcut.id)}
              className="editorial-app group flex min-w-0 flex-col items-center text-center"
              aria-label={`打开${shortcut.label}`}
            >
              <span className="grid aspect-square w-full max-w-[72px] place-items-center rounded-[20px] border border-border bg-card shadow-sm transition-transform group-hover:-translate-y-1 group-hover:shadow-md sm:max-w-[88px]">
                <Icon className="size-5 text-foreground sm:size-6" strokeWidth={1.7} />
              </span>
              <span className="mt-2 block text-xs font-medium text-foreground sm:text-sm">{shortcut.label}</span>
              <span className="mt-0.5 hidden text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:block">{shortcut.caption}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
