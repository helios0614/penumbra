/**
 * 聊天组件 - 桌面小组件
 */

import { MessageSquare, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChatWidget() {
  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-md bg-primary/10">
          <MessageSquare className="size-4 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground">对话</h3>
      </div>

      {/* 消息预览 */}
      <div className="flex-1 min-h-0 flex flex-col justify-end">
        <div className="space-y-2">
          {/* 最后一条消息预览 */}
          <div className="bg-surface-secondary rounded-md p-3 text-sm text-muted-foreground">
            <p className="line-clamp-2">今天有什么安排？</p>
          </div>

          {/* 快速回复建议 */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              className={cn(
                'px-2 py-1 rounded-md text-xs',
                'bg-primary/10 text-primary',
                'hover:bg-primary/20 transition-colors'
              )}
            >
              查看日程
            </button>
            <button
              className={cn(
                'px-2 py-1 rounded-md text-xs',
                'bg-primary/10 text-primary',
                'hover:bg-primary/20 transition-colors'
              )}
            >
              写日记
            </button>
          </div>
        </div>
      </div>

      {/* 快速输入框 */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="说点什么..."
          className={cn(
            'flex-1 px-3 py-2 rounded-md text-sm',
            'bg-surface-secondary border border-border',
            'focus:outline-none focus:border-primary focus:ring-2',
            'focus:ring-primary/25 transition-all'
          )}
        />
        <button
          className={cn(
            'p-2 rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary-hover transition-colors'
          )}
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

// 懒加载需要 default 导出
export default ChatWidget;
