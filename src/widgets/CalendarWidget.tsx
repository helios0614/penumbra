/**
 * 日历组件 - 桌面小组件
 */

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function CalendarWidget() {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 获取月份的第一天是周几（0-6，0是周日）
  const firstDayOfWeek = monthStart.getDay();

  // 填充月初空白
  const paddingDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-secondary/10">
            <Calendar className="size-4 text-secondary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">日历</h3>
            <p className="text-xs text-muted-foreground">
              {format(today, 'yyyy年MM月', { locale: zhCN })}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            className={cn(
              'p-1 rounded hover:bg-surface-secondary',
              'transition-colors text-muted-foreground hover:text-foreground'
            )}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            className={cn(
              'p-1 rounded hover:bg-surface-secondary',
              'transition-colors text-muted-foreground hover:text-foreground'
            )}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['日', '一', '二', '三', '四', '五', '六'].map((week, i) => (
          <div
            key={i}
            className="text-center text-[11px] text-muted-foreground font-medium"
          >
            {week}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1">
        {/* 月初空白填充 */}
        {paddingDays.map((_, i) => (
          <div key={`pad-${i}`} className="min-h-0" />
        ))}

        {/* 日期 */}
        {days.map((date) => {
          const isToday = isSameDay(date, today);
          return (
            <button
              key={date.toISOString()}
              className={cn(
                'min-h-0 rounded-md flex items-center justify-center text-xs sm:text-sm',
                'hover:bg-surface-secondary transition-colors',
                isToday && 'bg-primary text-primary-foreground hover:bg-primary-hover'
              )}
            >
              {format(date, 'd')}
            </button>
          );
        })}
      </div>

      {/* 今日日程预览 */}
      <div className="mt-2 pt-2 border-t border-border">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">今日日程</span>
          <span className="ml-auto font-medium text-foreground">3项</span>
        </div>
      </div>
    </div>
  );
}

// 懒加载需要 default 导出
export default CalendarWidget;
