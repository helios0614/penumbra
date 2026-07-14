/**
 * 天气组件 - 桌面小组件
 */

import { Sun, Cloud, CloudRain, Droplets } from 'lucide-react';

export function WeatherWidget() {
  // 模拟天气数据
  const weather = {
    temp: 26,
    condition: 'sunny', // sunny, cloudy, rainy
    humidity: 65,
  };

  const getWeatherIcon = () => {
    switch (weather.condition) {
      case 'sunny':
        return <Sun className="size-8 text-primary" />;
      case 'cloudy':
        return <Cloud className="size-8 text-muted-foreground" />;
      case 'rainy':
        return <CloudRain className="size-8 text-blue-400" />;
      default:
        return <Sun className="size-8 text-primary" />;
    }
  };

  return (
    <div className="flex items-center justify-between h-full">
      <div className="flex items-center gap-3">
        {getWeatherIcon()}
        <div>
          <div className="text-2xl font-semibold text-foreground tabular-nums">
            {weather.temp}°
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Droplets className="size-3" />
            {weather.humidity}%
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-muted-foreground">北京</div>
        <div className="text-xs text-muted-foreground">晴朗</div>
      </div>
    </div>
  );
}

// 懒加载需要 default 导出
export default WeatherWidget;
