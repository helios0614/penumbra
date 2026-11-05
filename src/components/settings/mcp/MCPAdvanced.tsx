import { useEffect, useRef, useState } from "react";
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
  return <details className="mist-glass rounded-2xl p-4"><summary className="cursor-pointer text-sm font-medium">高级设置</summary><div className="mt-3 space-y-3 text-xs">
    <p className="text-muted-foreground">限制 MCP 工具结果后的链式追加深度，默认 5。0 允许保存，不会关闭 MCP 全局开关。</p>
    <label className="block space-y-1">最大链式追加深度<Input aria-label="最大链式追加深度" type="number" min={0} max={20} step={1} value={value} disabled={read.state.busy || write.state.busy} aria-invalid={!validDepth(value)} onChange={e => { setValue(e.target.value); setNotice(""); }} /></label>
    {!validDepth(value) && <p role="alert">请输入 0–20 的整数。</p>}
    <MCPFailure error={read.state.error ?? write.state.error} />
    {notice && <p role="status">{notice}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!validDepth(value) || Number(value) === snapshot || snapshot === null || read.state.busy || write.state.busy} onClick={() => { void save(); }}>保存高级设置</Button><Button size="sm" variant="outline" disabled={write.state.busy || read.state.busy} onClick={() => { void load(); }}>重新读取高级设置</Button></div>
  </div></details>;
}
