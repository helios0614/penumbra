/**
 * 桌面主组件
 *
 * 网格布局 + 组件注册表 + 布局持久化
 */

import { useState, useEffect, useMemo, Suspense, type ComponentType } from 'react';
import {
  CalendarDays,
  Check,
  CircleCheckBig,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  StickyNote,
  X,
} from 'lucide-react';
import { SettingsView } from '@/components/settings/SettingsView';
import {
  DesktopAppView,
  type DesktopAppId,
  isDesktopAppId,
} from '@/components/apps/DesktopAppView';
import { getAllWidgets, widgetRegistry } from './registry';
import {
  addWidgetToLayout,
  loadDesktopLayout,
  removeWidgetFromLayout,
  resetDesktopLayout,
  type DesktopLayoutItem,
} from './storage';
import { cn } from '@/lib/utils';

// 网格配置
const GRID_GAP = 12;
const GRID_COLUMNS = {
  mobile: 2,
  tablet: 4,
  desktop: 6,
} as const;

interface DesktopAppShortcut {
  id: DesktopAppId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const DESKTOP_APPS: DesktopAppShortcut[] = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'calendar', label: '日历', icon: CalendarDays },
  { id: 'todo', label: '待办', icon: CircleCheckBig },
  { id: 'notes', label: '笔记', icon: StickyNote },
];

function getAppFromPath(pathname: string): DesktopAppId | null {
  const match = pathname.match(/^\/app\/([^/]+)\/?$/);
  return match && isDesktopAppId(match[1]) ? match[1] : null;
}

/**
 * 计算组件的网格样式
 * 注意：在响应式布局下，列位置会自动调整
 */
function getGridStyles(item: DesktopLayoutItem, screenSize: 'mobile' | 'tablet' | 'desktop') {
  const widget = widgetRegistry[item.widgetId];
  if (!widget) return null;

  const size = item.size || widget.size;
  const pos = item.position;
  const columnCount = GRID_COLUMNS[screenSize];
  const cols = Math.min(size.cols, columnCount);

  if (screenSize === 'mobile') {
    return {
      gridColumn: `span ${cols}`,
      gridRow: `span ${size.rows}`,
    };
  }

  if (screenSize === 'tablet') {
    return {
      gridColumn: `span ${cols}`,
      gridRow: `span ${size.rows}`,
    };
  }

  return {
    gridColumn: `${pos.col + 1} / span ${cols}`,
    gridRow: `${pos.row + 1} / span ${size.rows}`,
  };
}

/**
 * 组件卡片容器
 */
function WidgetCard({
  children,
  className,
  isEditing,
  onOpen,
  onRemove,
  widgetId,
  widgetInstanceId,
  widgetName,
}: {
  children: React.ReactNode;
  className?: string;
  isEditing: boolean;
  onOpen: () => void;
  onRemove: () => void;
  widgetId: string;
  widgetInstanceId: string;
  widgetName: string;
}) {
  return (
    <div
      data-widget-id={widgetId}
      className={cn(
        'widget-card group relative',
        'bg-white/70 backdrop-blur-md dark:bg-black/40',
        'border border-white/15 dark:border-white/10',
        'shadow-[0_4px_20px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.1)]',
        'rounded-[22px]',
        'transition-all duration-200',
        !isEditing && 'hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:-translate-y-0.5',
        isEditing && 'widget-editing ring-1 ring-primary/20',
        'h-full w-full overflow-hidden',
        'p-3',
        'select-none',
        className
      )}
    >
      {isEditing && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-black/65 text-white shadow-sm backdrop-blur transition-transform hover:scale-105 hover:bg-black/75"
          title="移除组件"
        >
          <X className="size-4" />
        </button>
      )}
      {!isEditing && (
        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 z-[5] cursor-pointer rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary"
          aria-label={`打开${widgetName}`}
          title={`打开${widgetName}`}
          data-testid={`widget-open-${widgetInstanceId}`}
        />
      )}
      <div className={cn('h-full', !isEditing && 'pointer-events-none')} inert={!isEditing ? true : undefined}>
        {children}
      </div>
    </div>
  );
}

function AppDock({ onLaunch }: { onLaunch: (appId: DesktopAppId) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 sm:bottom-5">
      <span className="desktop-dock-scrim pointer-events-none absolute -bottom-3 h-28 w-full max-w-lg" />
      <div className="pointer-events-auto relative flex items-center gap-3 rounded-[28px] border border-white/20 bg-white/25 p-2.5 shadow-[0_12px_40px_rgba(51,43,36,0.13)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/35 sm:gap-4 sm:p-3">
        {DESKTOP_APPS.map((app) => {
          const Icon = app.icon;

          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onLaunch(app.id)}
              className="desktop-app-button group relative grid size-12 place-items-center rounded-[16px] transition-transform hover:-translate-y-1 active:scale-95 sm:size-14 sm:rounded-[18px]"
              title={`打开${app.label}`}
              aria-label={`打开${app.label}`}
              data-testid={`dock-app-${app.id}`}
            >
              <span
                className="desktop-app-icon absolute inset-0 rounded-[inherit] transition-shadow group-hover:shadow-lg"
              />
              <Icon className="relative size-6 sm:size-7" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 加载占位符
 */
function WidgetSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

/**
 * 桌面主组件
 */
export function Desktop() {
  const [layout, setLayout] = useState<DesktopLayoutItem[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeApp, setActiveApp] = useState<DesktopAppId | null>(() => {
    if (typeof window === 'undefined') return null;
    return getAppFromPath(window.location.pathname);
  });
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth < 640) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'desktop';
  });

  // 加载布局
  useEffect(() => {
    setLayout(loadDesktopLayout());
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveApp(getAppFromPath(window.location.pathname));
      setIsSettingsOpen(false);
      setIsEditing(false);
      setIsPickerOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 监听屏幕尺寸变化
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setScreenSize(w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 网格样式（gap 通过内联样式，列数通过 CSS 类）
  const gridStyle = useMemo(() => ({
    gap: `${GRID_GAP}px`,
  }), []);

  const widgets = useMemo(() => getAllWidgets(), []);
  const desktopGreeting = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 6 ? '夜深了' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
    const date = now.toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    return { greeting, date };
  }, []);

  const openApp = (appId: DesktopAppId) => {
    setIsSettingsOpen(false);
    setIsEditing(false);
    setIsPickerOpen(false);
    window.history.pushState({ penumbraApp: appId }, '', `/app/${appId}`);
    setActiveApp(appId);
  };

  const closeApp = () => {
    if (window.history.state?.penumbraApp) {
      window.history.back();
      return;
    }

    window.history.replaceState({}, '', '/');
    setActiveApp(null);
  };

  return (
    <div className="desktop-wallpaper relative h-dvh overflow-hidden text-foreground">
      <div className="desktop-wallpaper-texture pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex h-full flex-col">
        {!activeApp && <div className="shrink-0 px-4 pb-2 pt-4 sm:px-6">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">Penumbra</p>
              <h1 className="mt-0.5 text-[22px] font-semibold leading-tight">{desktopGreeting.greeting}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">{desktopGreeting.date}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsSettingsOpen((open) => !open);
                  setIsEditing(false);
                }}
                className={cn(
                  'grid size-10 place-items-center rounded-full shadow-sm transition-colors',
                  isSettingsOpen
                    ? 'bg-foreground text-background hover:bg-foreground/85'
                    : 'bg-white/55 text-foreground backdrop-blur-md hover:bg-white/75 dark:bg-black/35 dark:hover:bg-black/50'
                )}
                title="设置"
              >
                <Settings className="size-5" />
              </button>
              {!isSettingsOpen && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="grid size-10 place-items-center rounded-full bg-foreground text-background shadow-sm transition-colors hover:bg-foreground/85"
                  title="编辑桌面"
                >
                  <Pencil className="size-4.5" />
                </button>
              )}
              {!isSettingsOpen && isEditing && (
                <>
                  <button
                    onClick={() => {
                      const newLayout = resetDesktopLayout();
                      setLayout(newLayout);
                    }}
                    className="grid size-10 place-items-center rounded-full bg-white/55 text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-white/75 dark:bg-black/35 dark:hover:bg-black/50"
                    title="重置布局"
                  >
                    <RotateCcw className="size-5" />
                  </button>
                  <button
                    onClick={() => setIsPickerOpen(true)}
                    className="grid size-10 place-items-center rounded-full bg-white/55 text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-white/75 dark:bg-black/35 dark:hover:bg-black/50"
                    title="添加组件"
                  >
                    <Plus className="size-5" />
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="grid size-10 place-items-center rounded-full bg-foreground text-background shadow-sm transition-colors hover:bg-foreground/85"
                    title="完成编辑"
                  >
                    <Check className="size-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>}

        <div
          className={cn(
            'min-h-0 flex-1',
            activeApp
              ? 'overflow-hidden p-0 sm:px-6 sm:pb-6 sm:pt-4'
              : 'overflow-y-auto px-4 pb-28 pt-2 sm:px-6 sm:pb-32',
          )}
        >
          {activeApp ? (
            <DesktopAppView appId={activeApp} onBack={closeApp} />
          ) : isSettingsOpen ? (
            <SettingsView onBack={() => setIsSettingsOpen(false)} />
          ) : (
            <div
              style={gridStyle}
              className={cn(
                'desktop-home-grid mx-auto grid max-w-4xl auto-rows-[124px] sm:auto-rows-[116px] lg:auto-rows-[120px]',
                'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6'
              )}
            >
              {layout.map((item) => {
                const widget = widgetRegistry[item.widgetId];
                if (!widget) return null;

                const WidgetComponent = widget.component;
                const instanceId = item.instanceId || item.widgetId;

                return (
                  <div
                    key={instanceId}
                    style={getGridStyles(item, screenSize) || undefined}
                    className="min-h-0 rounded-[22px]"
                  >
                    <WidgetCard
                      isEditing={isEditing}
                      onOpen={() => {
                        if (isDesktopAppId(item.widgetId)) openApp(item.widgetId);
                      }}
                      onRemove={() => setLayout(removeWidgetFromLayout(instanceId))}
                      widgetId={item.widgetId}
                      widgetInstanceId={instanceId}
                      widgetName={widget.name}
                    >
                      <Suspense fallback={<WidgetSkeleton />}>
                        <WidgetComponent />
                      </Suspense>
                    </WidgetCard>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-white/25 bg-white/85 p-4 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/85">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">添加小组件</h2>
                <p className="text-xs text-muted-foreground">选择后会自动放到桌面空位</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="grid size-9 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                title="关闭"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {widgets.map((widget) => {
                const Icon = widget.icon;

                return (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => {
                      setLayout(addWidgetToLayout(widget.id));
                      setIsPickerOpen(false);
                    }}
                    className={cn(
                      'flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-white/70 p-3 text-left',
                      'shadow-sm transition hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10'
                    )}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{widget.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {widget.size.cols}x{widget.size.rows}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!activeApp && !isSettingsOpen && !isPickerOpen && <AppDock onLaunch={openApp} />}
    </div>
  );
}
