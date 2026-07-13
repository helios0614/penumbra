/**
 * 桌面小组件系统 - 导出入口
 */

// 主组件
export { Desktop } from './Desktop';

// 类型定义
export type {
  WidgetSize,
  WidgetPosition,
  WidgetMeta,
  WidgetRegistration,
  DesktopLayoutItem,
  DesktopLayout,
} from './types';
export { DESKTOP_LAYOUT_KEY } from './types';

// 注册表
export { widgetRegistry, getAllWidgets, getWidgetById, getWidgetsByCategory } from './registry';

// 存储工具
export {
  loadDesktopLayout,
  saveDesktopLayout,
  addWidgetToLayout,
  removeWidgetFromLayout,
  updateWidgetPosition,
  resetDesktopLayout,
} from './storage';

// 各个组件
export { ChatWidget } from './ChatWidget';
export { CalendarWidget } from './CalendarWidget';
export { ClockWidget } from './ClockWidget';
export { WeatherWidget } from './WeatherWidget';
export { MusicWidget } from './MusicWidget';
export { StickerWidget } from './StickerWidget';
export { SignatureWidget } from './SignatureWidget';
export { TodoWidget } from './TodoWidget';
export { NotesWidget } from './NotesWidget';
