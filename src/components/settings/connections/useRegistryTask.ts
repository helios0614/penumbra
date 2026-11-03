import { useCallback, useEffect, useRef, useState } from "react";
import { RegistryError } from "@/domain/registry/registry-types";

export interface TaskState<T> { readonly status: "idle" | "loading" | "success" | "error"; readonly data: T | null; readonly error: RegistryError | null }
/** Each keyed detail owns tasks. Reset/unmount invalidates even APIs that ignore abort. */
export function useRegistryTask<T>() {
  const [state, setState] = useState<TaskState<T>>({ status: "idle", data: null, error: null });
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); active.current = null; }; }, []);
  const reset = useCallback(() => {
    active.current?.abort(); active.current = null;
    if (mounted.current) setState({ status: "idle", data: null, error: null });
  }, []);
  const run = useCallback(async (work: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    if (!mounted.current) return;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setState({ status: "loading", data: null, error: null });
    const current = () => mounted.current && active.current === controller && !controller.signal.aborted;
    try {
      const data = await work(controller.signal);
      if (!current()) return;
      setState({ status: "success", data, error: null }); return data;
    } catch (error) {
      if (current()) setState({ status: "error", data: null, error: error instanceof RegistryError ? error : new RegistryError("unknown") });
    } finally { if (active.current === controller) active.current = null; }
  }, []);
  return { state, run, reset };
}
