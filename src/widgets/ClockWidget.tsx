/**
 * 时钟组件 - 桌面小组件
 */

import { Clock } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useState, useEffect } from 'react';

export function ClockWidget() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(time, 'EEE', { locale: zhCN })}
          </span>
        </div>
        <div className="text-3xl font-semibold text-foreground tabular-nums">
          {format(time, 'HH:mm')}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">
          {format(time, 'yyyy/MM/dd')}
        </div>
      </div>
    </div>
  );
}

// 懒加载需要 default 导出
export default ClockWidget;
