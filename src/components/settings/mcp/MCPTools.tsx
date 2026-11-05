import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { listTools, toggleTool, type MCPTool } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
import { MCPFailure } from "./MCPShared";
export function MCPTools({ id, enabled, refresh, count }: { id: string; enabled: boolean; refresh: () => Promise<unknown>; count: (tools: MCPTool[] | null) => void }) {
  const [tools, setTools] = useState<MCPTool[] | null>(null), [check, setCheck] = useState(false);
  const read = useMCPTask<MCPTool[]>(), write = useMCPTask<boolean>(), lock = useRef(false);
  const load = async () => { const result = await read.run(signal => listTools(id, signal)); if (result) { setTools(result); count(result); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (read.state.error) { setTools(null); count(null); } }, [read.state.error]);
  useEffect(() => { if (write.state.error?.status === 409) { setCheck(true); void load(); void refresh(); } }, [write.state.error]);
  const toggle = async (tool: MCPTool, enabled: boolean) => {
    if (lock.current || check || read.state.busy) return;
    lock.current = true;
    const result = await write.run(signal => toggleTool(id, tool.name, enabled, signal));
    lock.current = false;
    if (result) { const next = tools!.map(item => item.name === tool.name ? { ...item, enabled } : item); setTools(next); count(next); await refresh(); }
  };
  return <section aria-label={`工具管理 ${id}`} className="space-y-3 border-t border-border/60 pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-medium">工具管理</h5><Button size="sm" variant="outline" disabled={read.state.busy || write.state.busy} onClick={() => { void load(); }}>刷新工具列表</Button></div>
    <p className="text-muted-foreground">加载可能连接服务器并发现工具。{!enabled && "当前服务器已停用，后端可能拒绝重新加载；已知工具配置仍保留。"}</p>
    {read.state.busy && <p role="status">正在加载工具…</p>}
    <MCPFailure error={read.state.error ?? write.state.error} />
    {check && <div className="space-y-2"><p>请核对最新服务器与工具状态；本次开关未自动重发。</p><Button size="sm" variant="outline" disabled={read.state.busy || !!read.state.error || tools === null} onClick={() => { setCheck(false); write.reset(); }}>已核对工具，继续操作</Button></div>}
    {tools && <p>已启用 {tools.filter(tool => tool.enabled).length} / 共 {tools.length} 项</p>}
    {tools?.length === 0 && <p>后端返回的工具列表为空。</p>}
    {tools?.map(tool => <div key={tool.name} className="min-w-0 rounded-xl border border-border/60 bg-background/25 p-3">
      <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-all font-medium">{tool.name}</span><Switch aria-label={`启用工具 ${tool.name}`} checked={tool.enabled} disabled={write.state.busy || read.state.busy || check} onCheckedChange={value => { void toggle(tool, value); }} /></div>
      <p className="whitespace-pre-wrap break-words text-muted-foreground">{tool.description || "暂无说明"}</p>
      <details className="mt-2"><summary className="cursor-pointer">输入 Schema</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/50 p-2 text-[11px]">{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>
    </div>)}
  </section>;
}
