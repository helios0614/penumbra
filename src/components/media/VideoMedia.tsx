import { useEffect, useState } from "react";
import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";
export function VideoMedia({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => { setFailed(false); setRetry(0); }, [url]);
  return <div className="media-video">
    {failed ? <div role="alert" className="flex min-h-28 flex-col items-center justify-center gap-2 text-xs text-muted-strong"><Film className="size-6" /><p>视频暂不可用或浏览器不支持此格式</p><Button variant="ghost" size="compact" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>重新读取</Button></div>
      : <video key={`${url}:${retry}`} src={url} controls playsInline preload="metadata" aria-label={label} onError={() => setFailed(true)} />}
  </div>;
}
