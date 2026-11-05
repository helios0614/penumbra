import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDepth, saveDepth, validDepth } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
import { MCPFailure } from "./MCPShared";
export function MCPAdvanced() {
  const [value, setValue] = useState("5"), [snapshot, setSnapshot] = useState<number | null>(null), [notice, setNotice] = useState("");
  const read = useMCPTask<number>(), write = useMCPTask<number>(), lock = useRef(false);
  const load = async () => { const result = await read.run(getDepth); if (result !== undefined) { setValue(String(result)); setSnapshot(result); } };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (lock.current || !validDepth(value)) return;
    lock.current = true; setNotice("");
    const result = await write.run(signal => saveDepth(value, signal)); lock.current = false;
    if (result !== undefined) { setSnapshot(result); setNotice("已保存并重新读取核对。"); }
  };
  return <details data-mcp-advanced className="group border-t border-border/60"><summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:px-4 [&::-webkit-details-marker]:hidden"><ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90" /><span>高级设置</span><span data-mcp-depth-summary className="ml-auto text-xs font-normal text-muted-foreground">追加深度 · {snapshot ?? (read.state.error ? "未读取" : "读取中…")}</span></summary><div className="space-y-2 px-3 pb-3 text-xs sm:px-4">
    <p className="leading-relaxed text-muted-foreground">限制 MCP 工具结果后的链式追加深度，默认 5。0 允许保存，不会关闭 MCP 全局开关。</p>
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-2"><span>最大链式追加深度</span><Input surface="translucent" controlSize="comfortable" className="max-w-32" aria-label="最大链式追加深度" type="number" min={0} max={20} step={1} value={value} disabled={read.state.busy || write.state.busy} aria-invalid={!validDepth(value)} onChange={e => { setValue(e.target.value); setNotice(""); }} /></label><span className="pb-2 text-muted-foreground">0–20，整数</span></div>
    {!validDepth(value) && <p role="alert">请输入 0–20 的整数。</p>}
    <MCPFailure error={read.state.error ?? write.state.error} />
    {notice && <p role="status">{notice}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" aria-label="刷新高级设置" disabled={write.state.busy || read.state.busy} onClick={() => { void load(); }}>刷新</Button><Button size="sm" aria-label="保存高级设置" disabled={!validDepth(value) || Number(value) === snapshot || snapshot === null || read.state.busy || write.state.busy} onClick={() => { void save(); }}>保存</Button></div>
  </div></details>;
}
