import { useCallback, useEffect, useRef, useState } from "react";
import { advancedSettingsError } from "@/domain/advanced-settings/advanced-settings-client";

type SettingsWrite = (signal: AbortSignal) => Promise<void>;

export function useSettingsReadback<T>(read: (signal: AbortSignal) => Promise<T>) {
  const request = useRef<AbortController | null>(null);
  const [value, setValue] = useState<T | null>(null);
  const [pending, setPending] = useState<"read" | "save" | null>("read");
  const [error, setError] = useState("");

  const run = useCallback(async (write?: SettingsWrite) => {
    if (request.current) return false;
    const controller = new AbortController();
    const { signal } = controller;
    request.current = controller;
    setPending(write ? "save" : "read");
    setError("");
    let reading = !write;
    try {
      if (write) await write(signal);
      reading = true;
      const next = await read(signal);
      if (signal.aborted) return false;
      setValue(next);
      return true;
    } catch (cause) {
      if (!signal.aborted) {
        // A failed readback leaves the current value unknown.
        if (reading) setValue(null);
        const label = reading ? (write ? "保存后的读取失败" : "读取失败") : "保存失败";
        setError(`${label} · ${advancedSettingsError(cause)}`);
      }
      return false;
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(null);
      }
    }
  }, [read]);

  useEffect(() => {
    void run();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [run]);

  return { value, pending, error, refresh: () => run(), save: (write: SettingsWrite) => run(write) };
}
