import { musicStreamUrl } from "@/domain/media/media-resources";
import { createMusicVolumePreference } from "./music-volume";

export type AudioStatus = "idle" | "loading" | "buffering" | "playing" | "paused" | "ended" | "error";
export type AudioState = { readonly identity: string | null; readonly status: AudioStatus; readonly position: number; readonly duration: number | null; readonly seekable: boolean; readonly error: string | null; readonly volume: number; readonly volumeError: string | null };
const initial: AudioState = Object.freeze({ identity: null, status: "idle", position: 0, duration: null, seekable: false, error: null, volume: 100, volumeError: null });

/** One browser audio per Chat scope. Does not execute MUSIC or persist results. */
export function createAudioController(createAudio: () => HTMLAudioElement = () => new Audio(), resourceUrl: (id: number) => string = musicStreamUrl) {
  const volumePreference = createMusicVolumePreference();
  let audio: HTMLAudioElement | null = null, state = { ...initial, volume: volumePreference.read() }, sequence = 0, playRequest = 0, alive = true;
  let cleanup = () => {};
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<AudioState>) => { if (!alive) return; state = Object.freeze({ ...state, ...patch }); listeners.forEach(fn => fn()); };
  const syncVolume = () => { const volume = volumePreference.read(); if (audio) audio.volume = volume / 100; publish({ volume }); };
  const clear = () => {
    sequence++; playRequest++; cleanup(); cleanup = () => {};
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
  };
  const times = () => audio ? { position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null,
    seekable: audio.seekable.length > 0 && Number.isFinite(audio.duration) && audio.duration > 0 } : {};
  const error = () => publish({ status: "error", error: "音频未能播放。请检查登录或资源，点击重试。" });
  const begin = () => {
    if (!audio) return;
    const attempt = sequence, request = ++playRequest;
    try {
      // Invoke synchronously in the click gesture, before any detail request.
      void audio.play().catch(() => { if (attempt === sequence && request === playRequest) error(); });
    } catch { if (attempt === sequence && request === playRequest) error(); }
  };
  return {
    getState: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    play(identity: string, song: number) {
      if (!alive || !identity || !Number.isSafeInteger(song) || song <= 0) return;
      if (state.identity === identity && audio && !["error", "ended", "idle"].includes(state.status)) {
        if (state.status === "playing" || state.status === "loading" || state.status === "buffering") { playRequest++; audio.pause(); publish({ status: "paused" }); }
        else { syncVolume(); publish({ status: "loading", error: null }); begin(); }
        return;
      }
      clear();
      if (!audio) { try { audio = createAudio(); } catch { publish({ identity }); error(); return; } }
      const current = sequence, target = audio;
      const bindings: [string, EventListener][] = [];
      const on = (name: string, fn: () => void) => {
        const listener = () => { if (alive && current === sequence && audio === target) fn(); };
        bindings.push([name, listener]); target.addEventListener(name, listener);
      };
      cleanup = () => bindings.forEach(([name, fn]) => target.removeEventListener(name, fn));
      on("playing", () => { if (!target.paused) publish({ status: "playing", error: null, ...times() }); });
      on("pause", () => { if (!target.ended && state.status !== "error") publish({ status: "paused", ...times() }); });
      on("waiting", () => { if (!target.paused) publish({ status: "buffering" }); });
      on("stalled", () => { if (!target.paused) publish({ status: "buffering" }); });
      on("ended", () => publish({ status: "ended", ...times() }));
      on("error", error);
      for (const event of ["loadedmetadata", "durationchange", "timeupdate", "progress", "canplay"]) on(event, () => publish(times()));
      publish({ ...initial, identity, status: "loading", volume: volumePreference.read() });
      target.preload = "none";
      target.volume = state.volume / 100;
      target.src = resourceUrl(song);
      begin();
    },
    setVolume(percent: number) {
      if (!alive || !Number.isFinite(percent)) return;
      const preference = volumePreference.write(percent);
      if (audio) audio.volume = preference.volume / 100;
      publish(preference);
    },
    seek(fraction: number) {
      if (!audio || !state.seekable || !state.duration || !Number.isFinite(fraction)) return;
      const desired = Math.max(0, Math.min(1, fraction)) * state.duration;
      // Only seek inside the ranges actually advertised by this media element.
      for (let i = 0; i < audio.seekable.length; i++) {
        if (desired >= audio.seekable.start(i) && desired <= audio.seekable.end(i)) {
          try { audio.currentTime = desired; } catch { /* Availability may change while dragging. */ }
          break;
        }
      }
    },
    stop() { clear(); publish({ ...initial, volume: state.volume, volumeError: state.volumeError }); },
    activate() {
      alive = true; syncVolume();
      if (typeof window !== "undefined") { window.addEventListener("musicvolumechange", syncVolume); window.addEventListener("pageshow", syncVolume); window.addEventListener("storage", storageVolume); document.addEventListener("visibilitychange", syncVolume); }
    },
    dispose() {
      clear(); alive = false; audio = null; state = { ...initial, volume: state.volume };
      if (typeof window !== "undefined") { window.removeEventListener("musicvolumechange", syncVolume); window.removeEventListener("pageshow", syncVolume); window.removeEventListener("storage", storageVolume); document.removeEventListener("visibilitychange", syncVolume); }
    },
  };
  function storageVolume(event: StorageEvent) { if (event.key === "aion_music_volume" || event.key === null) syncVolume(); }
}
export type AudioController = ReturnType<typeof createAudioController>;
