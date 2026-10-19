/**
 * 待办事项组件 - 桌面小组件
 */

import { CheckCircle, Circle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TodoWidget() {
  const todos = [
    { id: 1, text: '完成项目文档', done: true },
    { id: 2, text: '团队周会', done: false },
    { id: 3, text: '代码审查', done: false },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-success/10">
            <CheckCircle className="size-4 text-success" />
          </div>
          <h3 className="font-semibold text-foreground">待办示例</h3>
        </div>
        <button className="p-1 hover:bg-surface-secondary rounded transition-colors">
          <Plus className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* 待办列表 */}
      <div className="scrollbar-none flex-1 min-h-0 space-y-2 overflow-y-auto">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className={cn(
              'flex items-center gap-2 p-2 rounded-md transition-colors',
              todo.done ? 'bg-muted/30' : 'bg-surface-secondary hover:bg-surface'
            )}
          >
            <button className="shrink-0">
              {todo.done ? (
                <CheckCircle className="size-4 text-success" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
            </button>
            <span
              className={cn(
                'text-sm flex-1 truncate',
                todo.done && 'text-muted-foreground line-through'
              )}
            >
              {todo.text}
            </span>
          </div>
        ))}
      </div>

      {/* 统计 */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm">
        <span className="text-xs text-muted-foreground">示例清单 · 未同步</span>
        <span className="font-medium text-foreground">
          {todos.filter(t => t.done).length}/{todos.length}
        </span>
      </div>
    </div>
  );
}

// 懒加载需要 default 导出
export default TodoWidget;
