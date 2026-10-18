/**
 * 笔记组件 - 桌面小组件
 */

import { StickyNote, Plus, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotesWidget() {
  const notes = [
    { id: 1, title: '购物清单', content: '牛奶、面包、鸡蛋...', time: '10:30' },
    { id: 2, title: '会议纪要', content: '讨论项目进度...', time: '昨天' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <StickyNote className="size-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">笔记</h3>
        </div>
        <div className="flex gap-1">
          <button className="p-1 hover:bg-surface-secondary rounded transition-colors">
            <Plus className="size-4 text-muted-foreground" />
          </button>
          <button className="p-1 hover:bg-surface-secondary rounded transition-colors">
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* 笔记列表 */}
      <div className="scrollbar-none flex-1 min-h-0 space-y-2 overflow-y-auto">
        {notes.map((note) => (
          <button
            key={note.id}
            className={cn(
              'w-full text-left p-3 rounded-md',
              'bg-surface-secondary hover:bg-surface',
              'transition-colors group'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate text-sm">
                  {note.title}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {note.content}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {note.time}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* 快速添加按钮 */}
      <button
        className={cn(
          'mt-3 w-full py-2 rounded-md text-sm font-medium',
          'bg-primary/10 text-primary-ink',
          'hover:bg-primary/20 transition-colors',
          'flex items-center justify-center gap-2'
        )}
      >
        <Plus className="size-4" />
        快速笔记
      </button>
    </div>
  );
}

// 懒加载需要 default 导出
export default NotesWidget;
