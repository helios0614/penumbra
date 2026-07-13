/**
 * 桌面主组件
 *
 * 网格布局 + 组件注册表 + 布局持久化
 */

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  type ComponentType,
  type UIEvent,
} from 'react';
import {
  CalendarDays,
  Check,
  CircleCheckBig,
  MessageSquare,
  Newspaper,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { SettingsView } from '@/components/settings/SettingsView';
import { DesktopApps } from '@/components/desktop/DesktopApps';
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
import {
  getCustomWallpaper,
  getStoredWallpaperSettings,
  WALLPAPER_CHANGE_EVENT,
} from '@/lib/wallpaper';

// 网格配置
const GRID_GAP = 12;
const GRID_COLUMNS = {
  mobile: 2,
  tablet: 4,
  desktop: 4,
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
];

const HOME_PAGE = 0;
const WIDGETS_PAGE = 1;
const HOME_GRID_COLUMNS = 2;
const HOME_MAX_ROWS = 3;
const HOME_MAX_WIDGETS = 3;

function measureHomeLayout(items: DesktopLayoutItem[]) {
  const cells = Array.from({ length: HOME_MAX_ROWS }, () => Array(HOME_GRID_COLUMNS).fill(false));
  let usedRows = 0;

  for (const item of items) {
    const widget = widgetRegistry[item.widgetId];
    if (!widget) continue;

    const size = item.size || widget.size;
    const cols = Math.min(size.cols, HOME_GRID_COLUMNS);
    const rows = size.rows;
    let placement: { row: number; col: number } | null = null;

    for (let row = 0; row <= HOME_MAX_ROWS - rows && !placement; row += 1) {
      for (let col = 0; col <= HOME_GRID_COLUMNS - cols; col += 1) {
        let isFree = true;
        for (let rowOffset = 0; rowOffset < rows && isFree; rowOffset += 1) {
          for (let colOffset = 0; colOffset < cols; colOffset += 1) {
            if (cells[row + rowOffset][col + colOffset]) {
              isFree = false;
              break;
            }
          }
        }

        if (isFree) {
          placement = { row, col };
          break;
        }
      }
    }

    if (!placement) return { fits: false, rows: HOME_MAX_ROWS + 1 };

    for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < cols; colOffset += 1) {
        cells[placement.row + rowOffset][placement.col + colOffset] = true;
      }
    }
    usedRows = Math.max(usedRows, placement.row + rows);
  }

  return { fits: true, rows: usedRows };
}

function getHomeGridStyles(item: DesktopLayoutItem) {
  const widget = widgetRegistry[item.widgetId];
  if (!widget) return undefined;

  const size = item.size || widget.size;
  return {
    gridColumn: `span ${Math.min(size.cols, HOME_GRID_COLUMNS)}`,
    gridRow: `span ${size.rows}`,
  };
}

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
  canRemove = true,
  children,
  className,
  isEditing,
  onOpen,
  onRemove,
  widgetId,
  widgetInstanceId,
  widgetName,
}: {
  canRemove?: boolean;
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
        'widget-card mist-glass group relative',
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
      {isEditing && canRemove && (
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

function AppDock({
  isEditing,
  onAddWidget,
  onLaunch,
  onOpenEditorial,
  onResetLayout,
  onToggleEditing,
}: {
  isEditing: boolean;
  onAddWidget: () => void;
  onLaunch: (appId: DesktopAppId) => void;
  onOpenEditorial: () => void;
  onResetLayout: () => void;
  onToggleEditing: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 sm:bottom-5">
      <span className="desktop-dock-scrim pointer-events-none absolute -bottom-3 h-28 w-full max-w-lg" />
      <div className="relative flex flex-col items-center gap-2.5">
        {isEditing && (
          <div className="desktop-edit-menu mist-glass-strong pointer-events-auto flex items-center gap-1.5 rounded-[22px] p-2">
            <button
              type="button"
              onClick={onResetLayout}
              className="desktop-edit-action"
              aria-label="重置桌面布局"
              title="重置布局"
            >
              <RotateCcw className="size-4.5" />
              <span>重置</span>
            </button>
            <button
              type="button"
              onClick={onAddWidget}
              className="desktop-edit-action"
              aria-label="添加桌面组件"
              title="添加组件"
            >
              <Plus className="size-4.5" />
              <span>组件</span>
            </button>
            <button
              type="button"
              onClick={onOpenEditorial}
              className="desktop-edit-action"
              aria-label="切换到实验桌面"
              title="实验桌面"
            >
              <Newspaper className="size-4.5" />
              <span>实验桌面</span>
            </button>
          </div>
        )}

        <div className="desktop-dock mist-glass pointer-events-auto relative flex items-center gap-3 rounded-[28px] p-2.5 sm:gap-4 sm:p-3">
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
                <span className="desktop-app-icon mist-glass absolute inset-0 rounded-[inherit] transition-shadow group-hover:shadow-lg" />
                <Icon className="relative size-6 sm:size-7" />
              </button>
            );
          })}

          <button
            type="button"
            onClick={onToggleEditing}
            className="desktop-app-button desktop-edit-button group relative grid size-12 place-items-center rounded-[16px] transition-transform hover:-translate-y-1 active:scale-95 sm:size-14 sm:rounded-[18px]"
            data-active={isEditing}
            title={isEditing ? '完成编辑' : '编辑桌面'}
            aria-label={isEditing ? '完成编辑' : '编辑桌面'}
            aria-pressed={isEditing}
          >
            <span className="desktop-app-icon mist-glass absolute inset-0 rounded-[inherit] transition-shadow group-hover:shadow-lg" />
            {isEditing ? <Check className="relative size-6 sm:size-7" /> : <Pencil className="relative size-6 sm:size-7" />}
          </button>
        </div>
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
  const [desktopPage, setDesktopPage] = useState(0);
  const [wallpaperSettings, setWallpaperSettings] = useState(getStoredWallpaperSettings);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const desktopPagerRef = useRef<HTMLDivElement>(null);
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
    let disposed = false;
    let currentUrl: string | null = null;
    let loadId = 0;

    const loadWallpaper = async () => {
      const requestId = ++loadId;
      const settings = getStoredWallpaperSettings();
      setWallpaperSettings(settings);

      let nextUrl: string | null = null;
      if (settings.mode === 'custom') {
        try {
          const wallpaper = await getCustomWallpaper();
          if (wallpaper) nextUrl = URL.createObjectURL(wallpaper);
        } catch {
          nextUrl = null;
        }
      }

      if (disposed || requestId !== loadId) {
        if (nextUrl) URL.revokeObjectURL(nextUrl);
        return;
      }

      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = nextUrl;
      setWallpaperUrl(nextUrl);
    };

    const handleWallpaperChange = () => void loadWallpaper();
    void loadWallpaper();
    window.addEventListener(WALLPAPER_CHANGE_EVENT, handleWallpaperChange);

    return () => {
      disposed = true;
      window.removeEventListener(WALLPAPER_CHANGE_EVENT, handleWallpaperChange);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
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
  const primaryLayout = useMemo(
    () => layout.filter((item) => (item.page ?? WIDGETS_PAGE) === HOME_PAGE),
    [layout],
  );
  const secondaryLayout = useMemo(
    () => layout.filter((item) => (item.page ?? WIDGETS_PAGE) === WIDGETS_PAGE),
    [layout],
  );
  const primaryLayoutMeasure = useMemo(() => measureHomeLayout(primaryLayout), [primaryLayout]);
  const primaryGridStyle = useMemo(() => ({
    ...gridStyle,
    gridAutoRows: primaryLayoutMeasure.rows >= HOME_MAX_ROWS
      ? 'clamp(64px, calc((100dvh - 390px) / 3), 124px)'
      : 'clamp(104px, 16dvh, 124px)',
  }), [gridStyle, primaryLayoutMeasure.rows]);

  const goToDesktopPage = (page: number, behavior: ScrollBehavior = 'smooth') => {
    const pager = desktopPagerRef.current;
    if (!pager) return;

    setDesktopPage(page);
    pager.scrollTo({ left: pager.clientWidth * page, behavior });
  };

  const handleDesktopPageScroll = (event: UIEvent<HTMLDivElement>) => {
    const pager = event.currentTarget;
    if (!pager.clientWidth) return;

    const page = Math.max(0, Math.min(1, Math.round(pager.scrollLeft / pager.clientWidth)));
    setDesktopPage((current) => (current === page ? current : page));
  };

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
    <div
      className="desktop-wallpaper relative h-dvh overflow-hidden text-foreground"
      data-wallpaper-mode={wallpaperUrl ? 'custom' : 'ambient'}
      data-wallpaper-shade={wallpaperSettings.shade}
    >
      {wallpaperUrl && (
        <div
          className="desktop-wallpaper-image pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${JSON.stringify(wallpaperUrl)})`,
            backgroundPosition: wallpaperSettings.position,
            backgroundSize: wallpaperSettings.fit,
          }}
        />
      )}
      <div className="desktop-wallpaper-overlay pointer-events-none absolute inset-0" />
      <div className="desktop-wallpaper-texture pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex h-full flex-col">
        <div
          className={cn(
            'min-h-0 flex-1',
            activeApp
              ? 'overflow-hidden p-0 sm:px-6 sm:pb-6 sm:pt-4'
              : isSettingsOpen
                ? 'overflow-y-auto px-4 pb-28 pt-5 sm:px-6 sm:pb-32 sm:pt-8'
                : 'overflow-hidden px-4 pb-[98px] pt-3 sm:px-6 sm:pb-[112px] sm:pt-5',
          )}
        >
          {activeApp ? (
            <DesktopAppView appId={activeApp} onBack={closeApp} />
          ) : isSettingsOpen ? (
            <SettingsView onBack={() => setIsSettingsOpen(false)} />
          ) : (
            <div className="desktop-home-grid relative mx-auto h-full max-w-5xl">
              <div
                ref={desktopPagerRef}
                className="desktop-home-pager flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth"
                onScroll={handleDesktopPageScroll}
              >
                <section
                  className="desktop-home-page flex h-full w-full shrink-0 snap-start snap-always flex-col justify-between overflow-hidden px-px pb-1 pt-6"
                  aria-label="桌面第一页"
                >
                  <section className="mx-auto w-full max-w-[680px]" aria-labelledby="desktop-primary-widgets-title">
                    <h2 id="desktop-primary-widgets-title" className="sr-only">常驻组件</h2>
                    <div
                      className="grid grid-flow-row-dense grid-cols-2"
                      data-home-rows={primaryLayoutMeasure.rows}
                      style={primaryGridStyle}
                    >
                      {primaryLayout.map((item) => {
                        const widget = widgetRegistry[item.widgetId];
                        if (!widget) return null;

                        const WidgetComponent = widget.component;
                        const instanceId = item.instanceId || item.widgetId;

                        return (
                          <div
                            key={instanceId}
                            className="min-h-0 rounded-[22px]"
                            style={getHomeGridStyles(item)}
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
                  </section>

                  <DesktopApps
                    onLaunch={openApp}
                    onSettings={() => {
                      setIsSettingsOpen(true);
                      setIsEditing(false);
                    }}
                  />
                </section>

                <section
                  className="desktop-home-page h-full w-full shrink-0 snap-start snap-always overflow-hidden px-px pb-1 pt-6"
                  aria-label="桌面第二页"
                >
                  <section className="desktop-secondary-widgets mx-auto h-full w-full max-w-[680px] overflow-y-auto" aria-labelledby="desktop-secondary-widgets-title">
                    <h2 id="desktop-secondary-widgets-title" className="sr-only">其他小组件</h2>
                    <div
                      style={gridStyle}
                      className={cn(
                        'grid auto-rows-[clamp(72px,13dvh,124px)] pb-1 sm:auto-rows-[116px] lg:auto-rows-[120px]',
                        'grid-cols-2 sm:grid-cols-4'
                      )}
                    >
                      {secondaryLayout.map((item) => {
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
                  </section>
                </section>
              </div>

              <div className="desktop-page-indicator absolute inset-x-0 top-1 z-10 flex justify-center gap-1.5" aria-label="桌面分页">
                {[0, 1].map((page) => (
                  <button
                    key={page}
                    type="button"
                    className="desktop-page-dot"
                    data-active={desktopPage === page}
                    onClick={() => goToDesktopPage(page)}
                    aria-label={`切换到桌面第${page + 1}页`}
                    aria-current={desktopPage === page ? 'page' : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-sm sm:items-center">
          <div className="mist-glass-strong w-full max-w-md rounded-[28px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">
                  {desktopPage === HOME_PAGE ? '添加到首页' : '添加到第二页'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {desktopPage === HOME_PAGE
                    ? `最多 ${HOME_MAX_WIDGETS} 个组件，当前占用 ${primaryLayoutMeasure.rows}/${HOME_MAX_ROWS} 行`
                    : '选择后会自动放到第二页空位'}
                </p>
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
                const isHomePicker = desktopPage === HOME_PAGE;
                const isAlreadyOnHome = isHomePicker
                  && primaryLayout.some((item) => item.widgetId === widget.id);
                const candidateMeasure = isHomePicker
                  ? measureHomeLayout([
                      ...primaryLayout,
                      { widgetId: widget.id, page: HOME_PAGE, position: { col: 0, row: 0 } },
                    ])
                  : null;
                const homeCountReached = isHomePicker && primaryLayout.length >= HOME_MAX_WIDGETS;
                const exceedsHomeRows = isHomePicker && candidateMeasure?.fits === false;
                const isDisabled = isAlreadyOnHome || homeCountReached || exceedsHomeRows;
                const sizeLabel = `${Math.min(widget.size.cols, HOME_GRID_COLUMNS)}×${widget.size.rows}`;
                const statusLabel = isAlreadyOnHome
                  ? '已在首页'
                  : homeCountReached
                    ? '首页最多 3 个'
                    : exceedsHomeRows
                      ? '添加后超过 3 行'
                      : isHomePicker
                        ? `${sizeLabel} · 可添加`
                        : `${widget.size.cols}×${widget.size.rows}`;

                return (
                  <button
                    key={widget.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;

                      const targetPage = desktopPage === HOME_PAGE ? HOME_PAGE : WIDGETS_PAGE;
                      setLayout(addWidgetToLayout(widget.id, undefined, targetPage));
                      setIsPickerOpen(false);
                      requestAnimationFrame(() => goToDesktopPage(targetPage));
                    }}
                    className={cn(
                      'mist-solid flex min-h-20 items-center gap-3 rounded-2xl p-3 text-left',
                      'transition hover:-translate-y-0.5 hover:bg-white/95 dark:hover:bg-white/10',
                      'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0',
                    )}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{widget.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {statusLabel}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!activeApp && !isSettingsOpen && !isPickerOpen && (
        <AppDock
          isEditing={isEditing}
          onAddWidget={() => setIsPickerOpen(true)}
          onLaunch={openApp}
          onOpenEditorial={() => window.location.assign('/editorial')}
          onResetLayout={() => setLayout(resetDesktopLayout())}
          onToggleEditing={() => setIsEditing((editing) => !editing)}
        />
      )}
    </div>
  );
}
