import type { MusicMedia } from "@/domain/media/media-types";
export const musicIdentity = (message: string, index: number, song: MusicMedia) => `${message}:media:${index}:${song.id ?? "missing"}`;
