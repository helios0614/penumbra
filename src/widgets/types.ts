/**
 * 桌面小组件系统类型定义
 */

import { ComponentType } from 'react';

/**
 * 组件尺寸（占用网格数）
 */
export interface WidgetSize {
  cols: number; // 占几列
  rows: number; // 占几行
}

/**
 * 组件位置
 */
export interface WidgetPosition {
  col: number; // 第几列（从0开始）
  row: number; // 第几行（从0开始）
}

/**
 * 组件注册信息
 */
export interface WidgetMeta {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  size: WidgetSize;
  description?: string;
  category?: 'productivity' | 'lifestyle' | 'info' | 'media';
}

/**
 * 组件注册项（包含懒加载的组件）
 */
export interface WidgetRegistration extends WidgetMeta {
  component: ComponentType;
}

/**
 * 桌面布局项（描述某个组件实例在桌面上的位置和尺寸）
 */
export interface DesktopLayoutItem {
  instanceId?: string; // 小组件实例 ID，兼容旧布局可为空
  widgetId: string;
  position: WidgetPosition;
  size?: WidgetSize; // 可选，覆盖默认尺寸
  minimized?: boolean; // 是否最小化
}

/**
 * 桌面配置（存 localStorage）
 */
export type DesktopLayout = DesktopLayoutItem[];

/**
 * 桌面配置存储键
 */
export const DESKTOP_LAYOUT_KEY = 'penumbra-desktop-layout';
