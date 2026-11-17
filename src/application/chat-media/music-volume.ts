const KEY = "aion_music_volume";
type MusicBridge = { getMusicVolume(): number; setMusicVolume(percent: number): void };
const bridge = () => typeof window === "undefined" ? undefined : (window as unknown as { AionMusic?: Partial<MusicBridge> }).AionMusic;

function normalize(value: unknown): number {
  if (value === null || value === undefined || value === "") return 100;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 100;
}

/** Device preference only. A broken bridge falls back to the browser for this scope. */
export function createMusicVolumePreference() {
  let current = 100, nativeWriteFailed = false;
  return {
    read() {
      try {
        const native = bridge();
        if (!nativeWriteFailed && typeof native?.getMusicVolume === "function") return current = normalize(native.getMusicVolume());
      } catch { /* Try the existing Web preference. */ }
      try { return current = normalize(localStorage.getItem(KEY)); } catch { return current; }
    },
    write(value: number) {
      const percent = Math.round(normalize(value));
      let persisted = false;
      try {
        const native = bridge();
        if (typeof native?.setMusicVolume === "function") {
          native.setMusicVolume(percent); persisted = true; nativeWriteFailed = false;
        } else if (native) nativeWriteFailed = true;
      } catch { nativeWriteFailed = true; }
      try { localStorage.setItem(KEY, String(percent)); persisted = true; } catch { /* Native persistence is sufficient in WebView. */ }
      current = percent;
      return { volume: percent, volumeError: persisted ? null : "音量已调整，但未能保存到此设备。" };
    },
  };
}
