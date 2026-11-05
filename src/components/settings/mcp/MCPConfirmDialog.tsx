import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MCPError, clearSecret, deleteServer, type MCPServer } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
import { MCPDialog, MCPFailure } from "./MCPShared";
export function MCPConfirmDialog({ kind, server, close, refresh, saved }: {
  kind: "clear" | "delete"; server: MCPServer; close: () => void; refresh: () => Promise<unknown>; saved: () => void;
}) {
  const [ref] = useState(server.credential.secret_ref), [attempted, setAttempted] = useState(false);
  const task = useMCPTask<boolean>(), lock = useRef(false);
  useEffect(() => { if (task.state.error) void refresh(); }, [task.state.error]);
  const perform = async () => {
    if (lock.current || attempted) return;
    lock.current = true; setAttempted(true);
    const result = await task.run(async signal => {
      if (kind === "clear") { if (!ref) throw new MCPError("stale_secret_ref"); await clearSecret(ref, signal); }
      else await deleteServer(server.name, signal);
      if (!await refresh()) throw new MCPError("readback");
      return true;
    });
    lock.current = false; if (result) saved();
  };
  const clear = kind === "clear";
  return <MCPDialog title={clear ? "清除 MCP 凭据" : "删除 MCP 服务器"} description={clear ? "仅清除凭据，保留公开地址和服务器；后端会回收对应连接。" : "删除此服务器及其配置，后端会回收对应连接。"} close={close} busy={task.state.busy}
    footer={<><Button variant="outline" disabled={task.state.busy} onClick={close}>取消</Button><Button variant="destructive" disabled={task.state.busy || attempted || (clear && !!server.url_diagnostic)} onClick={() => { void perform(); }}>{clear ? "确认清除凭据" : "确认删除服务器"}</Button></>}>
    <p className="break-words text-sm">{server.displayName}</p><MCPFailure error={task.state.error} />
    {clear && server.url_diagnostic && <p role="alert" className="text-xs">{server.url_diagnostic}。地址存在歧义，请先编辑并手动修正地址，不能强行清除。</p>}
    {attempted && !task.state.busy && <p className="text-xs">本次操作不会自动重试，请关闭后核对最新状态，再重新确认。</p>}
  </MCPDialog>;
}
