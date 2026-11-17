import { apiPost, apiGet, ApiError, openApiStream, UPLOAD_URL } from "@/lib/api";
import { mapUploadResponse } from "./media-mappers";
import { musicCover } from "./media-resources";
import type { UploadedMedia } from "./media-types";

const UPLOAD_TIMEOUT_MS = 300_000;

export async function uploadMedia(file: File, signal: AbortSignal): Promise<UploadedMedia> {
  const form = new FormData(); form.append("file", file);
  const result = mapUploadResponse(await apiPost<unknown>(UPLOAD_URL, form, { signal, timeoutMs: UPLOAD_TIMEOUT_MS }));
  if (result.type !== file.type) throw new Error("上传响应的类型无法确认，文件已保留。");
  return result;
}
export async function readMusicDetail(id: number, signal: AbortSignal) {
  const data = await apiGet<unknown>(`/api/music/detail/${id}`, { signal, query: { include_audio_url: false } });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("歌曲信息暂不可用");
  const item = data as Record<string, unknown>;
  if (item.id !== id || "error" in item) throw new Error("歌曲信息暂不可用");
  // Never use CDN audio_url or replace the identity/name in saved history.
  return { cover: musicCover(item.cover), album: typeof item.album === "string" ? item.album.slice(0, 500) : undefined };
}

/** One bounded check after a media error, never an automatic playback retry. */
export async function diagnoseMusicStream(id: number, signal: AbortSignal): Promise<string> {
  try {
    const result = await openApiStream(`/api/music/stream/${id}`, {
      signal, timeoutMs: 15_000, headers: { Range: "bytes=0-0", Accept: "audio/*, application/json" },
    });
    // If an upstream ignores Range, do not download the rest of the song.
    await result.body.cancel();
    return /^audio\//i.test(result.contentType)
      ? "音频播放失败；当前链接检查可用，请点击重试。"
      : "音频播放失败；链接检查未返回有效音频，请点击重试。";
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof ApiError) {
      const code = (error.data as { code?: unknown } | null)?.code;
      const messages: Record<string, string> = {
        music_url_unavailable: "播放链接获取失败：服务未提供可用地址，可能受版权、地区或歌曲权限限制。请点击重试。",
        music_url_invalid: "播放链接获取失败：服务返回的地址不可用。请点击重试。",
        music_url_request_failed: "播放链接获取失败：音乐服务请求未能完成。请点击重试。",
        music_resource_forbidden: "音频资源拒绝访问，可能受权限限制或链接已过期。请点击重试。",
        music_resource_unavailable: "已获取链接，但音频资源暂不可用。请点击重试。",
        music_resource_invalid: "已获取链接，但服务未返回有效音频。请点击重试。",
        music_resource_connection_failed: "已获取链接，但音频连接失败。请点击重试。",
        music_range_invalid: "音频范围响应不可用，请点击重试。",
        music_range_unavailable: "音频范围不可用，请点击重试。",
      };
      if (typeof code === "string" && messages[code]) return messages[code];
      if (error.status === 401) return "音频播放失败；AionHome 会话验证失败，请检查本站登录状态。";
      if (error.code === "TIMEOUT") return "音频播放失败；链接检查超时，请点击重试。";
    }
    return "音频播放失败；暂时无法确认链接状态，请点击重试。";
  }
}
