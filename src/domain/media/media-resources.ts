import { resolveHttpUrl, runtimeConfig } from "@/lib/runtime-config";
import type { UploadMime } from "./media-types";

// Only public user uploads produced by the old route or the UUID route.
// Camera shares the disk root: accepting every /uploads path would expose it.
const uploadPath = /^\/uploads\/(?:\d{10,17}|[a-f0-9]{32})\.(jpe?g|png|gif|webp|mp4|webm|mov|qt)$/i;
export function uploadResource(value: unknown): { path: string; url: string; kind: "image" | "video"; mime: UploadMime } | null {
  if (typeof value !== "string") return null;
  const match = uploadPath.exec(value);
  if (!match || match[0] !== value) return null;
  const mime: Record<string, UploadMime> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", qt: "video/quicktime" };
  return { path: value, url: resolveHttpUrl(runtimeConfig.apiBaseUrl, value), kind: /^(mp4|webm|mov|qt)$/i.test(match[1]) ? "video" : "image", mime: mime[match[1].toLowerCase()] };
}

/** No credentials, private local routes, protocol-relative URLs, data or blob input. */
export function markdownImageResource(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || /[\\\u0000-\u0020]/.test(value)) return null;
  if (value.startsWith("/")) return uploadResource(value)?.url ?? null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    const ownOrigins = [typeof location === "undefined" ? null : location.origin];
    if (/^https?:\/\//.test(runtimeConfig.apiBaseUrl)) ownOrigins.push(new URL(runtimeConfig.apiBaseUrl).origin);
    if (ownOrigins.includes(url.origin)) return !url.search ? uploadResource(url.pathname)?.url ?? null : null;
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname)) return null;
    if (/\/(?:uploads|screenshots|api|static|data)(?:\/|$)/i.test(decodeURIComponent(url.pathname))) return null;
    if ([...url.searchParams.keys()].some(key => /token|secret|password|auth|cookie|api.?key/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

export function songId(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function musicStreamUrl(id: number): string {
  return resolveHttpUrl(runtimeConfig.apiBaseUrl, `/api/music/stream/${id}`);
}
export function musicCover(value: unknown): string | undefined {
  const url = markdownImageResource(value);
  if (!url) return undefined;
  const host = new URL(url).hostname;
  return /(^|\.)music\.126\.net$/.test(host) ? url : undefined;
}
