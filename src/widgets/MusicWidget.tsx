/**
 * 音乐组件 - 桌面小组件
 */

import { Music, Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MusicWidget() {
  const isPlaying = false; // 模拟播放状态

  return (
    <div className="flex items-center gap-3 h-full">
      {/* 专辑封面 */}
      <div className="w-16 h-16 rounded-md bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center shrink-0">
        <Music className="size-6 text-primary" />
      </div>

      {/* 歌曲信息 */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground truncate">夜曲</div>
        <div className="text-sm text-muted-foreground truncate">周杰伦</div>

        {/* 播放控制 */}
        <div className="flex items-center gap-2 mt-2">
          <button className="p-1 hover:bg-surface-secondary rounded transition-colors">
            <SkipBack className="size-4 text-muted-foreground" />
          </button>
          <button className={cn(
            'p-1.5 rounded-full transition-colors',
            isPlaying ? 'bg-primary text-primary-foreground' : 'bg-surface-secondary hover:bg-surface'
          )}>
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button className="p-1 hover:bg-surface-secondary rounded transition-colors">
            <SkipForward className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* 音量 */}
      <button className="p-1 hover:bg-surface-secondary rounded transition-colors">
        <Volume2 className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}

// 懒加载需要 default 导出
export default MusicWidget;
