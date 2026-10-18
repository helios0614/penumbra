import { lazy, Suspense, useRef, type ComponentType } from "react";
import { ToastProvider } from "@/components/ui/toast";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CloudSun,
  MessageSquare,
  Music2,
  LoaderCircle,
  LibraryBig,
  StickyNote,
  NotebookPen,
  History,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

const Calendar = lazy(() => import("@/components/calendar/Calendar"));
const ChatView = lazy(() =>
  import("@/components/chat/ChatView").then((module) => ({ default: module.ChatView })),
);
const MemoryView = lazy(() =>
  import("@/components/memory/MemoryView").then((module) => ({ default: module.MemoryView })),
);
const QuickNoteView = lazy(() =>
  import("@/components/quick-note/QuickNoteView").then((module) => ({ default: module.QuickNoteView })),
);
const ActivityView = lazy(() =>
  import("@/components/activity/ActivityView").then((module) => ({ default: module.ActivityView })),
);
const LocationView = lazy(() =>
  import("@/components/location/LocationView").then((module) => ({ default: module.LocationView })),
);

export type DesktopAppId =
  | "chat"
  | "calendar"
  | "todo"
  | "notes"
  | "clock"
  | "weather"
  | "music"
  | "memory"
  | "quick-notes"
  | "activity"
  | "location";

interface DesktopAppMeta {
  name: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

export const DESKTOP_APP_META: Record<DesktopAppId, DesktopAppMeta> = {
  chat: { name: "对话", description: "与 Penumbra 开始一段对话", icon: MessageSquare },
  calendar: { name: "日历", description: "查看日期和日程安排", icon: CalendarDays },
  todo: { name: "待办", description: "整理接下来要完成的事情", icon: CheckCircle2 },
  notes: { name: "笔记", description: "记录临时想法和重要内容", icon: StickyNote },
  clock: { name: "时钟", description: "时钟与提醒功能", icon: Clock3 },
  weather: { name: "天气", description: "查看天气和未来预报", icon: CloudSun },
  music: { name: "音乐", description: "播放和管理音乐", icon: Music2 },
  memory: { name: "记忆库", description: "翻阅被留下来的片段", icon: LibraryBig },
  "quick-notes": { name: "速记", description: "按时段整理，可以回看的生活记录", icon: NotebookPen },
  activity: { name: "活动日志", description: "设备上的点滴活动，构成一天的轨迹。", icon: History },
  location: { name: "定位", description: "最近上报的位置、静默时段与附近地点", icon: MapPin },
};

export function isDesktopAppId(value: string): value is DesktopAppId {
  return value in DESKTOP_APP_META;
}

export function DesktopAppView({
  appId,
  onBack,
}: {
  appId: DesktopAppId;
  onBack: () => void;
}) {
  const app = DESKTOP_APP_META[appId];
  const Icon = app.icon;
  const viewportRef = useRef<HTMLElement>(null);

  return (
    <ToastProvider key={appId} viewportRef={viewportRef} mobileClearance={16}>
    <section
      ref={viewportRef}
      className={cn(
        "mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden sm:rounded-[28px]",
        appId === "chat" ? "mist-glass" : appId === "memory" || appId === "quick-notes" || appId === "activity" || appId === "location" ? "" : "mist-glass-strong",
      )}
      data-testid="desktop-app-view"
    >
      {appId !== "chat" && appId !== "memory" && appId !== "quick-notes" && appId !== "activity" && appId !== "location" && (
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onBack}
            className="mist-glass grid size-10 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-white/75 dark:hover:bg-white/15"
            aria-label="返回桌面"
            title="返回桌面"
          >
            <ArrowLeft className="size-5" />
          </button>
          <span className="desktop-app-mini-icon grid size-10 shrink-0 place-items-center rounded-[14px]">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground">{app.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{app.description}</p>
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<AppLoading />}>
          {appId === "chat" && <ChatView onBack={onBack} />}
          {appId === "memory" && <MemoryView onBack={onBack} />}
          {appId === "quick-notes" && <QuickNoteView onBack={onBack} />}
          {appId === "activity" && <ActivityView onBack={onBack} />}
          {appId === "location" && <LocationView onBack={onBack} />}
          {appId === "calendar" && (
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              <Calendar embedded className="mx-auto w-full max-w-xl" />
            </div>
          )}
          {appId !== "chat" && appId !== "calendar" && appId !== "memory" && appId !== "quick-notes" && appId !== "activity" && appId !== "location" && (
            <AppPlaceholder appId={appId} />
          )}
        </Suspense>
      </div>
    </section>
    </ToastProvider>
  );
}

function AppLoading() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center text-primary">
      <LoaderCircle className="size-7 animate-spin" aria-label="正在打开应用" />
    </div>
  );
}

function AppPlaceholder({ appId }: { appId: DesktopAppId }) {
  const app = DESKTOP_APP_META[appId];
  const Icon = app.icon;

  return (
    <div className="scrollbar-none grid min-h-0 flex-1 place-items-center overflow-y-auto p-6 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <span className="desktop-app-placeholder-icon grid size-20 place-items-center rounded-[24px]">
          <Icon className="size-9" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-foreground">{app.name}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {app.description}。页面还在搭建中，小组件目前作为这个应用的桌面快捷预览。
        </p>
      </div>
    </div>
  );
}

export default DesktopAppView;
