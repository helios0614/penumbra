import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import {
  DesktopAppView,
  isDesktopAppId,
  type DesktopAppId,
} from "@/components/apps/DesktopAppView";
import { SettingsView } from "@/components/settings/SettingsView";
import { closeSettingsHistory, isSettingsPath, pushSettingsHistory } from "@/components/settings/settings-navigation";
import { cn } from "@/lib/utils";
import { getDesktopAppId, getDesktopAppPath, getDesktopPath } from "@/lib/app-paths";
import { EditorialDock } from "./EditorialDock";
// Demo panels are temporarily hidden; keep EditorialPanels.tsx for later wiring.
// import { NowPlaying, TodayPanel } from "./EditorialPanels";
import { EditorialQuickApps } from "./EditorialQuickApps";
import { EditorialSignature } from "./EditorialSignature";

function getEditorialAppFromPath(pathname: string): DesktopAppId | null {
  const appId = getDesktopAppId(pathname, "editorial");
  return appId && isDesktopAppId(appId) ? appId : null;
}

export function EditorialDesktop() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => typeof window !== "undefined" && isSettingsPath(window.location.pathname, "editorial"));
  const [activeApp, setActiveApp] = useState<DesktopAppId | null>(() => (
    typeof window === "undefined" ? null : getEditorialAppFromPath(window.location.pathname)
  ));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveApp(getEditorialAppFromPath(window.location.pathname));
      setIsSettingsOpen(isSettingsPath(window.location.pathname, "editorial"));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const dateLabel = useMemo(() => now.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  }).toUpperCase(), [now]);
  const weekday = useMemo(() => now.toLocaleDateString("en-US", { weekday: "long" }), [now]);
  const timeLabel = useMemo(() => now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }), [now]);

  const openApp = (appId: DesktopAppId) => {
    setIsSettingsOpen(false);
    window.history.pushState({ penumbraEditorialApp: appId }, "", getDesktopAppPath(appId, "editorial"));
    setActiveApp(appId);
  };

  const closeApp = () => {
    if (window.history.state?.penumbraEditorialApp) {
      window.history.back();
      return;
    }
    window.history.replaceState({}, "", getDesktopPath("editorial"));
    setActiveApp(null);
  };

  const openSettings = () => {
    pushSettingsHistory(window, "editorial");
    setActiveApp(null);
    setIsSettingsOpen(true);
  };
  const closeSettings = () => {
    if (!closeSettingsHistory(window, "editorial")) setIsSettingsOpen(false);
  };

  const goHome = () => {
    setIsSettingsOpen(false);
    scrollAreaRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="editorial-desktop flex h-dvh flex-col overflow-hidden text-foreground">
      <header className="shrink-0 px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
        <div className="mx-auto flex max-w-6xl items-end justify-between gap-4">
          <div>
            <p className="editorial-serif text-[38px] italic leading-none tracking-[-0.04em] sm:text-5xl">{weekday}.</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-strong">
              {dateLabel} <span className="px-1">•</span> {timeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] sm:flex">
              <span className="size-2 rounded-full bg-foreground" />
              Mode: Day
            </span>
            <button
              type="button"
              onClick={() => window.location.assign(getDesktopPath())}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong bg-card px-3.5 text-xs font-medium shadow-sm hover:bg-surface-secondary"
              aria-label="返回经典桌面"
              title="返回经典桌面"
            >
              <LayoutGrid className="size-4" />
              <span className="hidden sm:inline">经典桌面</span>
            </button>
          </div>
        </div>
      </header>

      <main
        ref={scrollAreaRef}
        className={cn(
          "min-h-0 flex-1 px-4 sm:px-6",
          activeApp || isSettingsOpen ? "overflow-hidden pb-4" : "scrollbar-none overflow-y-auto pb-28 sm:pb-32",
        )}
      >
        {activeApp ? (
          <div className="mx-auto h-full max-w-6xl pb-4">
            <DesktopAppView appId={activeApp} onBack={closeApp} />
          </div>
        ) : isSettingsOpen ? (
          <SettingsView onBack={closeSettings} />
        ) : (
          <div className="editorial-home mx-auto max-w-6xl space-y-8 pb-4">
            <EditorialSignature />
            <div className="grid gap-8">
              <EditorialQuickApps onLaunch={openApp} onSettings={openSettings} />
              {/* Temporarily hidden example previews; real Todo and Chat shortcuts remain.
              <div className="space-y-3">
                <TodayPanel onOpen={() => openApp("todo")} />
                <NowPlaying onOpen={() => openApp("music")} />
              </div>
              */}
            </div>
          </div>
        )}
      </main>

      {!activeApp && !isSettingsOpen && (
        <EditorialDock onHome={goHome} onLaunch={openApp} onSettings={openSettings} />
      )}
    </div>
  );
}

export default EditorialDesktop;
