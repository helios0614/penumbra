import type { MediaAttachment, MusicMedia, UploadedMedia, UploadMime } from "./media-types";
import { UPLOAD_MIME_TYPES } from "./media-types";
import { musicCover, songId, uploadResource } from "./media-resources";

const unsupported = () => ({ kind: "unsupported", label: "附件暂不支持" } as const);
export function mapMediaAttachments(values: readonly unknown[], role: "user" | "assistant"): readonly MediaAttachment[] {
  return values.map(value => {
    const resource = uploadResource(value);
    if (resource) return { kind: resource.kind, url: resource.url, label: resource.kind === "image" ? "聊天图片" : "聊天视频" };
    if (role !== "assistant" || !value || typeof value !== "object" || Array.isArray(value)) return unsupported();
    const data = value as Record<string, unknown>;
    // Also accept the exact legacy full-song shape used by Activity; no text parsing.
    const fullLegacy = Array.isArray(data.artists) && typeof data.cover === "string" && typeof data.duration === "number";
    if ((data.type !== "music" && !(data.type === undefined && fullLegacy)) || typeof data.name !== "string" || typeof data.artist !== "string") return unsupported();
    return { kind: "music", id: songId(data.id), name: data.name.slice(0, 500), artist: data.artist.slice(0, 500),
      ...(typeof data.album === "string" ? { album: data.album.slice(0, 500) } : {}), ...(musicCover(data.cover) ? { cover: musicCover(data.cover) } : {}) } satisfies MusicMedia;
  });
}

export function mapUploadResponse(value: unknown): UploadedMedia {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("上传响应无法确认，文件已保留。请核对后显式重试。");
  const data = value as Record<string, unknown>;
  if ("error" in data) throw new Error("上传被拒绝，请检查文件格式和大小后重试。");
  const resource = uploadResource(data.url);
  if (!resource || !(UPLOAD_MIME_TYPES as readonly unknown[]).includes(data.type) || typeof data.name !== "string" ||
      data.type !== resource.mime) throw new Error("上传响应无法确认，文件已保留。请核对后显式重试。");
  return { url: resource.path, type: data.type as UploadMime, name: data.name };
}
