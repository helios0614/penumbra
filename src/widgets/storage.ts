/**
 * 桌面布局持久化工具
 */

import type { DesktopLayout, DesktopLayoutItem } from './types';
import { DESKTOP_LAYOUT_KEY } from './types';
import { widgetRegistry } from './registry';

// 重新导出类型，供外部使用
export type { DesktopLayout, DesktopLayoutItem };

/**
 * 默认桌面布局
 */
const DEFAULT_LAYOUT: DesktopLayout = [
  { instanceId: 'clock-default', widgetId: 'clock', page: 0, position: { col: 0, row: 0 } },
  { instanceId: 'weather-default', widgetId: 'weather', page: 0, position: { col: 1, row: 0 } },
  { instanceId: 'music-default', widgetId: 'music', page: 1, position: { col: 2, row: 0 } },
  { instanceId: 'calendar-default', widgetId: 'calendar', page: 1, position: { col: 0, row: 1 } },
  { instanceId: 'chat-default', widgetId: 'chat', page: 1, position: { col: 2, row: 1 } },
];

const DESKTOP_COLUMNS = 4;
const LEGACY_HOME_WIDGETS = new Set(['clock', 'weather']);

function createInstanceId(widgetId: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${widgetId}-${crypto.randomUUID()}`;
  }

  return `${widgetId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLayout(layout: DesktopLayout): DesktopLayout {
  return layout
    .filter((item) => widgetRegistry[item.widgetId])
    .reduce<DesktopLayout>((normalized, item, index) => {
      const widgetSize = item.size || widgetRegistry[item.widgetId]?.size || { cols: 1, rows: 1 };
      const inferredHomePage = LEGACY_HOME_WIDGETS.has(item.widgetId)
        && !normalized.some((existing) => existing.page === 0 && existing.widgetId === item.widgetId);
      const page = item.page ?? (inferredHomePage ? 0 : 1);
      const requestedPosition = {
        row: Math.max(0, item.position.row),
        col: Math.max(0, Math.min(item.position.col, DESKTOP_COLUMNS - widgetSize.cols)),
      };
      const candidate: DesktopLayoutItem = {
        ...item,
        instanceId: item.instanceId || `${item.widgetId}-${index}`,
        page,
        position: requestedPosition,
      };
      if (normalized.some((existing) => rectsOverlap(candidate, existing))) {
        candidate.position = findNextPosition(normalized, item.widgetId, page);
      }
      normalized.push(candidate);
      return normalized;
    }, []);
}

function rectsOverlap(a: DesktopLayoutItem, b: DesktopLayoutItem): boolean {
  if ((a.page ?? 1) !== (b.page ?? 1)) return false;

  const aWidget = widgetRegistry[a.widgetId];
  const bWidget = widgetRegistry[b.widgetId];
  if (!aWidget || !bWidget) return false;

  const aSize = a.size || aWidget.size;
  const bSize = b.size || bWidget.size;

  return (
    a.position.col < b.position.col + bSize.cols &&
    a.position.col + aSize.cols > b.position.col &&
    a.position.row < b.position.row + bSize.rows &&
    a.position.row + aSize.rows > b.position.row
  );
}

function findNextPosition(
  layout: DesktopLayout,
  widgetId: string,
  page: 0 | 1 = 1,
): { col: number; row: number } {
  const widget = widgetRegistry[widgetId];
  const size = widget?.size || { cols: 1, rows: 1 };
  const maxCol = Math.max(0, DESKTOP_COLUMNS - size.cols);

  for (let row = 0; row < 48; row += 1) {
    for (let col = 0; col <= maxCol; col += 1) {
      const candidate: DesktopLayoutItem = {
        instanceId: 'candidate',
        widgetId,
        page,
        position: { col, row },
      };

      if (!layout.some((item) => rectsOverlap(candidate, item))) {
        return { col, row };
      }
    }
  }

  const bottomRow = layout.filter((item) => (item.page ?? 1) === page).reduce((max, item) => {
    const widgetSize = item.size || widgetRegistry[item.widgetId]?.size || { rows: 1, cols: 1 };
    return Math.max(max, item.position.row + widgetSize.rows);
  }, 0);

  return { col: 0, row: bottomRow };
}

/**
 * 从 localStorage 加载桌面布局
 */
export function loadDesktopLayout(): DesktopLayout {
  try {
    const stored = localStorage.getItem(DESKTOP_LAYOUT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 简单校验格式
      if (Array.isArray(parsed)) {
        return normalizeLayout(parsed as DesktopLayout);
      }
    }
  } catch (error) {
    console.error('Failed to load desktop layout:', error);
  }
  // 返回默认布局
  return normalizeLayout(DEFAULT_LAYOUT);
}

/**
 * 保存桌面布局到 localStorage
 */
export function saveDesktopLayout(layout: DesktopLayout): void {
  try {
    localStorage.setItem(DESKTOP_LAYOUT_KEY, JSON.stringify(layout));
  } catch (error) {
    console.error('Failed to save desktop layout:', error);
  }
}

/**
 * 添加组件到桌面
 */
export function addWidgetToLayout(
  widgetId: string,
  position?: { col: number; row: number },
  page: 0 | 1 = 1,
): DesktopLayout {
  const layout = loadDesktopLayout();
  const newItem: DesktopLayoutItem = {
    instanceId: createInstanceId(widgetId),
    widgetId,
    page,
    position: position || findNextPosition(layout, widgetId, page),
  };
  layout.push(newItem);
  saveDesktopLayout(layout);
  return layout;
}

/**
 * 从桌面移除组件
 */
export function removeWidgetFromLayout(instanceId: string): DesktopLayout {
  const layout = loadDesktopLayout();
  const filtered = layout.filter(item => item.instanceId !== instanceId);
  saveDesktopLayout(filtered);
  return filtered;
}

/**
 * 更新组件位置
 */
export function updateWidgetPosition(
  instanceId: string,
  position: { col: number; row: number }
): DesktopLayout {
  const layout = loadDesktopLayout();
  const item = layout.find(item => item.instanceId === instanceId);
  if (item) {
    item.position = position;
    saveDesktopLayout(layout);
  }
  return layout;
}

/**
 * 重置为默认布局
 */
export function resetDesktopLayout(): DesktopLayout {
  const layout = normalizeLayout(DEFAULT_LAYOUT);
  saveDesktopLayout(layout);
  return layout;
}
