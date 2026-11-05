import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listTools, toggleTool, type MCPServer, type MCPTool } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
import { MCPFailure } from "./MCPShared";

export function MCPToolsDialog({ server, refresh, count, close }: {
  server: MCPServer; refresh: () => Promise<unknown>; count: (tools: MCPTool[] | null) => void; close: () => void;
}) {
  const { name: id, enabled } = server;
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
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent data-mcp-tools-dialog={id} className="h-[min(48rem,var(--dialog-available-height))] sm:max-w-2xl" closeButtonProps={{ "aria-label": "关闭工具管理" }}>
      <DialogHeader className="gap-2">
        <DialogTitle>工具管理</DialogTitle>
        <DialogDescription className="break-words">{server.displayName}</DialogDescription>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p role="status">{tools ? `已启用 ${tools.filter(tool => tool.enabled).length} / 共 ${tools.length} 项` : "工具数量待加载"}</p>
          <Button size="sm" variant="outline" disabled={read.state.busy || write.state.busy} onClick={() => { void load(); }}>刷新工具列表</Button>
        </div>
      </DialogHeader>
      <DialogBody aria-label={`工具管理 ${id}`} className="min-w-0 text-xs">
        <div className="space-y-3 pb-3">
          <p className="leading-relaxed text-muted-foreground">加载可能连接服务器并发现工具。{!enabled && "当前服务器已停用，后端可能拒绝重新加载；已知工具配置仍保留。"}</p>
          {read.state.busy && <p role="status">正在加载工具…</p>}
          <MCPFailure error={read.state.error ?? write.state.error} />
          {check && <div className="space-y-2"><p>请核对最新服务器与工具状态；本次开关未自动重发。</p><Button size="sm" variant="outline" disabled={read.state.busy || !!read.state.error || tools === null} onClick={() => { setCheck(false); write.reset(); }}>已核对工具，继续操作</Button></div>}
          {tools?.length === 0 && <p>后端返回的工具列表为空。</p>}
        </div>
        <div className="divide-y divide-border/60">
          {tools?.map(tool => <ToolRow key={tool.name} tool={tool} disabled={write.state.busy || read.state.busy || check} toggle={value => { void toggle(tool, value); }} />)}
        </div>
      </DialogBody>
    </DialogContent>
  </Dialog>;
}

function ToolRow({ tool, disabled, toggle }: { tool: MCPTool; disabled: boolean; toggle: (enabled: boolean) => void }) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [longDescription, setLongDescription] = useState(false);
  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;
    const measure = () => { if (!descriptionExpanded) setLongDescription(element.scrollHeight > element.clientHeight + 1); };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [tool.description, descriptionExpanded]);
  return <section data-mcp-tool={tool.name} className="min-w-0 py-3 first:pt-0">
    <div className="flex items-center justify-between gap-3"><h3 className="min-w-0 break-all text-sm font-medium">{tool.name}</h3><Switch aria-label={`启用工具 ${tool.name}`} checked={tool.enabled} disabled={disabled} onCheckedChange={toggle} /></div>
    <p ref={descriptionRef} data-tool-description className={`whitespace-pre-wrap break-words leading-relaxed text-muted-foreground ${descriptionExpanded ? "" : "line-clamp-3"}`}>{tool.description || "暂无说明"}</p>
    {(longDescription || descriptionExpanded) && <Button size="sm" variant="ghost" className="mt-1 px-0 text-primary-ink" aria-expanded={descriptionExpanded} onClick={() => setDescriptionExpanded(previous => !previous)}>{descriptionExpanded ? "收起说明" : "展开说明"}</Button>}
    <details className="mt-2"><summary className="min-h-9 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">输入 Schema</summary>
      <pre data-tool-schema className="mt-1 max-h-64 overflow-auto overscroll-contain whitespace-pre rounded-lg border border-border/60 bg-background/25 p-3 font-mono text-[11px] leading-relaxed [overflow-wrap:normal] [word-break:normal]">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
    </details>
  </section>;
}
