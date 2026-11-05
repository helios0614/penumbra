import { useCallback, useEffect, useRef, useState } from "react";
import { MCPError } from "@/domain/mcp/mcp-client";
/** Key owners by server/dialog. Sequence + abort also reject APIs that ignore cancellation. */
export function useMCPTask<T>() {
  const [state, setState] = useState<{ busy: boolean; data: T | null; error: MCPError | null }>({ busy: false, data: null, error: null });
  const current = useRef<AbortController | null>(null), mounted = useRef(true);
  const reset = useCallback(() => { current.current?.abort(); current.current = null; setState({ busy: false, data: null, error: null }); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current?.abort(); current.current = null; }; }, []);
  const run = useCallback(async (work: (signal: AbortSignal) => Promise<T>) => {
    if (!mounted.current) return;
    current.current?.abort(); const controller = new AbortController(); current.current = controller;
    const valid = () => mounted.current && current.current === controller && !controller.signal.aborted;
    setState({ busy: true, data: null, error: null });
    try { const data = await work(controller.signal); if (valid()) { setState({ busy: false, data, error: null }); return data; } }
    catch (e) { if (valid()) setState({ busy: false, data: null, error: e instanceof MCPError ? e : new MCPError("network") }); }
    finally { if (current.current === controller) current.current = null; }
  }, []);
  return { state, run, reset };
}
