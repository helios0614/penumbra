import { CalendarDays, Home, MessageCircle, Settings } from "lucide-react";
import type { DesktopAppId } from "@/components/apps/DesktopAppView";

export function EditorialDock({
  onHome,
  onLaunch,
  onSettings,
}: {
  onHome: () => void;
  onLaunch: (appId: DesktopAppId) => void;
  onSettings: () => void;
}) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 sm:bottom-5" aria-label="新桌面导航">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/90 p-2 shadow-lg backdrop-blur-xl">
        <DockButton label="回到顶部" active onClick={onHome} icon={Home} />
        <DockButton label="打开记挂" onClick={() => onLaunch("calendar")} icon={CalendarDays} />
        <DockButton label="打开对话" onClick={() => onLaunch("chat")} icon={MessageCircle} />
        <DockButton label="打开设置" onClick={onSettings} icon={Settings} />
      </div>
    </nav>
  );
}

function DockButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "grid size-12 place-items-center rounded-full bg-foreground text-background"
        : "grid size-12 place-items-center rounded-full text-foreground hover:bg-surface-secondary"}
      aria-label={label}
      title={label}
    >
      <Icon className="size-5" strokeWidth={active ? 2.3 : 1.9} />
    </button>
  );
}
