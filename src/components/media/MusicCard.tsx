import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, Info, LoaderCircle, Music2, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MusicMedia } from "@/domain/media/media-types";
import { readMusicDetail } from "@/domain/media/media-client";
import { useChatAudio } from "./ChatAudio";
import "./media.css";

export function MusicCard({ song, identity }: { song: MusicMedia; identity: string }) {
  const { controller, state } = useChatAudio();
  const [detail, setDetail] = useState<{ cover?: string; album?: string }>({});
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "failed" | "ready">("idle");
  const [coverFailed, setCoverFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setDetail({}); setDetailStatus("idle"); setCoverFailed(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [identity, song.id]);
  const loadDetail = async () => {
    if (!song.id || detailStatus === "loading") return;
    request.current?.abort(); const abort = new AbortController(); request.current = abort;
    setDetailStatus("loading");
    try { const value = await readMusicDetail(song.id, abort.signal); if (!abort.signal.aborted) { setDetail(value); setCoverFailed(false); setDetailStatus("ready"); } }
    catch { if (!abort.signal.aborted) setDetailStatus("failed"); }
  };
  const active = state.identity === identity;
  const busy = active && (state.status === "loading" || state.status === "buffering");
  const playing = active && state.status === "playing";
  const failed = active && state.status === "error";
  const cover = detail.cover ?? song.cover;
  const label = failed ? "重试播放" : busy ? "暂停加载" : playing ? "暂停" : "播放";
  return <section className="music-result" aria-label={`音乐：${song.name}`} data-music-card={identity}>
    <div className="music-result-main">
      <div className="music-result-cover" aria-hidden="true">
        {cover && !coverFailed ? <img src={cover} alt="" loading="lazy" onError={() => setCoverFailed(true)} /> : <Music2 className="size-6" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground" title={song.name}>{song.name || "未知歌曲"}</p>
        <p className="mt-0.5 truncate text-xs text-muted-strong">{song.artist || "未知歌手"}</p>
        {(detail.album || song.album) && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail.album || song.album}</p>}
      </div>
      <Button type="button" variant="ghost" size="icon-lg" className="size-11 shrink-0 rounded-full text-ai" disabled={!song.id || !controller}
        aria-label={`${label} ${song.name}`} title={label} onClick={() => { if (song.id) { controller?.play(identity, song.id); if (detailStatus === "idle") void loadDetail(); } }}>
        {failed ? <RotateCcw className="size-4" /> : busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
    </div>
    {active && <div className="music-result-progress">
      <input type="range" min={0} max={1000} value={state.duration ? Math.min(1000, state.position / state.duration * 1000) : 0}
        style={{ "--music-progress": `${state.duration ? Math.min(100, state.position / state.duration * 100) : 0}%` } as CSSProperties}
        disabled={!state.seekable} onChange={event => controller?.seek(Number(event.currentTarget.value) / 1000)} aria-label={`播放进度：${song.name}`}
        title={state.seekable ? "拖动调整播放进度" : "当前资源暂不支持拖动"} />
      <div className="flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{clock(state.position)} / {clock(state.duration)}</span>
        <span role="status">{busy ? state.status === "buffering" ? "缓冲中" : "正在连接音频" : playing ? "播放中" : state.status === "ended" ? "播放完成" : state.status === "paused" ? "已暂停" : "播放失败"}</span></div>
    </div>}
    {failed && <p role="alert" className="mt-2 text-xs text-destructive-foreground">{state.error}</p>}
    {!song.id && <p className="mt-2 text-xs text-muted-strong">这条记录没有可靠的歌曲 ID，暂不能播放。</p>}
    {song.id && <div className="music-result-links">
      <button type="button" disabled={detailStatus === "loading"} onClick={() => void loadDetail()} title="按需获取歌曲信息" className="inline-flex min-h-8 items-center gap-1 text-[11px] text-muted-strong">
        <Info className="size-3" />{detailStatus === "loading" ? "读取歌曲信息…" : detailStatus === "failed" ? "重试歌曲信息" : "歌曲信息"}</button>
      <a href={`https://music.163.com/song?id=${song.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-[11px] text-muted-strong">网易云查看<ExternalLink className="size-3" /></a>
    </div>}
  </section>;
}
export function clock(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
