/**
 * 桌面主组件
 *
 * 网格布局 + 组件注册表 + 布局持久化
 */

import { useState, useEffect, useMemo, Suspense } from 'react';
import { Plus, RotateCcw, Settings, X } from 'lucide-react';
import { SettingsView } from '@/components/settings/SettingsView';
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
  onRemove,
}: {
  children: React.ReactNode;
  className?: string;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative',
        'bg-white/70 backdrop-blur-md dark:bg-black/40',
        'border border-white/15 dark:border-white/10',
        'shadow-[0_4px_20px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.1)]',
        'rounded-[22px]',
        'transition-all duration-200',
        'hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]',
        'hover:-translate-y-0.5',
        'h-full w-full overflow-hidden',
        'p-3',
        'select-none',
        className
      )}
    >
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'absolute right-2 top-2 z-10 grid size-6 place-items-center rounded-full',
          'bg-black/55 text-white opacity-0 shadow-sm backdrop-blur',
          'transition-opacity hover:bg-black/70 group-hover:opacity-100 focus:opacity-100'
        )}
        title="移除组件"
      >
        <X className="size-3.5" />
      </button>
      {children}
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

  return (
    <div className="h-dvh overflow-hidden bg-[linear-gradient(160deg,#f8f3ec_0%,#e7f0ef_45%,#f9fbf8_100%)] text-foreground dark:bg-[linear-gradient(160deg,#10100f_0%,#18201f_45%,#111110_100%)]">
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-4 pb-2 pt-4 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight">Penumbra</h1>
              <p className="text-xs text-muted-foreground">桌面小组件</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsSettingsOpen((open) => !open)}
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
              {!isSettingsOpen && (
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
                    className="grid size-10 place-items-center rounded-full bg-foreground text-background shadow-sm transition-colors hover:bg-foreground/85"
                    title="添加组件"
                  >
                    <Plus className="size-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 sm:px-6">
          {isSettingsOpen ? (
            <SettingsView onBack={() => setIsSettingsOpen(false)} />
          ) : (
            <div
              style={gridStyle}
              className={cn(
                'mx-auto grid max-w-5xl auto-rows-[104px]',
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
                    className="min-h-0"
                  >
                    <WidgetCard
                      onRemove={() => setLayout(removeWidgetFromLayout(instanceId))}
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
    </div>
  );
}
