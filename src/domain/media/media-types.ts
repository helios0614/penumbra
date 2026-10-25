export const UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"] as const;
export type UploadMime = typeof UPLOAD_MIME_TYPES[number];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export type UploadedMedia = { readonly url: string; readonly type: UploadMime; readonly name: string };
export type VisualMedia = { readonly kind: "image" | "video"; readonly url: string; readonly label: string };
export type MusicMedia = { readonly kind: "music"; readonly id: number | null; readonly name: string; readonly artist: string; readonly album?: string; readonly cover?: string };
export type MediaAttachment = VisualMedia | MusicMedia | { readonly kind: "unsupported"; readonly label: "附件暂不支持" };

export function validateUpload(file: Pick<File, "type" | "size">): string | null {
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) return "仅支持 JPEG、PNG、GIF、WebP 图片和 MP4、WebM、QuickTime 视频。";
  if (!Number.isFinite(file.size) || file.size <= 0) return "文件为空或无法读取。";
  return file.size > MAX_UPLOAD_BYTES ? "文件太大，最大 20 MiB。" : null;
}
