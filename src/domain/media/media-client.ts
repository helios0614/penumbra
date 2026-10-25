import { apiPost, apiGet, UPLOAD_URL } from "@/lib/api";
import { mapUploadResponse } from "./media-mappers";
import { musicCover } from "./media-resources";
import type { UploadedMedia } from "./media-types";

export async function uploadMedia(file: File, signal: AbortSignal): Promise<UploadedMedia> {
  const form = new FormData(); form.append("file", file);
  const result = mapUploadResponse(await apiPost<unknown>(UPLOAD_URL, form, { signal }));
  if (result.type !== file.type) throw new Error("上传响应的类型无法确认，文件已保留。");
  return result;
}
export async function readMusicDetail(id: number, signal: AbortSignal) {
  const data = await apiGet<unknown>(`/api/music/detail/${id}`, { signal });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("歌曲信息暂不可用");
  const item = data as Record<string, unknown>;
  if (item.id !== id || "error" in item) throw new Error("歌曲信息暂不可用");
  // Never use CDN audio_url or replace the identity/name in saved history.
  return { cover: musicCover(item.cover), album: typeof item.album === "string" ? item.album.slice(0, 500) : undefined };
}
