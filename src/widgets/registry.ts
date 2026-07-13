/**
 * 桌面小组件注册表
 *
 * 所有可添加到桌面的组件都在这里注册。
 * 新增组件只需在此添加一条记录，桌面代码无需修改。
 */

import { lazy } from 'react';
import type { WidgetRegistration } from './types';
import {
  Calendar,
  CheckCircle,
  Clock,
  MessageSquare,
  Music,
  Signature,
  Sticker,
  StickyNote,
  Sun,
} from 'lucide-react';

/**
 * 组件注册表
 *
 * key: 组件唯一 ID
 * value: 组件元信息 + 懒加载的组件
 */
export const widgetRegistry: Record<string, WidgetRegistration> = {
  // 聊天组件 - 2x2
  chat: {
    id: 'chat',
    name: '对话',
    icon: MessageSquare,
    size: { cols: 2, rows: 2 },
    description: '快速对话入口',
    category: 'productivity',
    component: lazy(() => import('./ChatWidget')),
  },

  // 日历组件 - 2x2
  calendar: {
    id: 'calendar',
    name: '日历',
    icon: Calendar,
    size: { cols: 2, rows: 2 },
    description: '今日日程概览',
    category: 'productivity',
    component: lazy(() => import('./CalendarWidget')),
  },

  // 时钟组件 - 1x1
  clock: {
    id: 'clock',
    name: '时钟',
    icon: Clock,
    size: { cols: 1, rows: 1 },
    description: '当前时间',
    category: 'info',
    component: lazy(() => import('./ClockWidget')),
  },

  // 音乐组件 - 2x1
  music: {
    id: 'music',
    name: '音乐',
    icon: Music,
    size: { cols: 2, rows: 1 },
    description: '正在播放',
    category: 'media',
    component: lazy(() => import('./MusicWidget')),
  },

  // 贴纸 - 1x1
  sticker: {
    id: 'sticker',
    name: '贴纸',
    icon: Sticker,
    size: { cols: 1, rows: 1 },
    description: '装点桌面心情',
    category: 'lifestyle',
    component: lazy(() => import('./StickerWidget')),
  },

  // 个性签名 - 横向满行、紧凑高度
  signature: {
    id: 'signature',
    name: '个性签名',
    icon: Signature,
    size: { cols: 4, rows: 1 },
    description: '写下今天的一句话',
    category: 'lifestyle',
    component: lazy(() => import('./SignatureWidget')),
  },

  // 待办事项 - 2x2
  todo: {
    id: 'todo',
    name: '待办',
    icon: CheckCircle,
    size: { cols: 2, rows: 2 },
    description: '任务清单',
    category: 'productivity',
    component: lazy(() => import('./TodoWidget')),
  },

  // 笔记 - 2x2
  notes: {
    id: 'notes',
    name: '笔记',
    icon: StickyNote,
    size: { cols: 2, rows: 2 },
    description: '快速笔记',
    category: 'productivity',
    component: lazy(() => import('./NotesWidget')),
  },

  // 天气 - 1x1
  weather: {
    id: 'weather',
    name: '天气',
    icon: Sun,
    size: { cols: 1, rows: 1 },
    description: '今日天气',
    category: 'info',
    component: lazy(() => import('./WeatherWidget')),
  },
};

/**
 * 获取所有已注册的组件
 */
export function getAllWidgets(): WidgetRegistration[] {
  return Object.values(widgetRegistry);
}

/**
 * 根据 ID 获取组件
 */
export function getWidgetById(id: string): WidgetRegistration | undefined {
  return widgetRegistry[id];
}

/**
 * 按分类获取组件
 */
export function getWidgetsByCategory(category: WidgetRegistration['category']): WidgetRegistration[] {
  return getAllWidgets().filter(w => w.category === category);
}
