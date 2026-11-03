import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listConnections } from "@/domain/registry/registry-client";
import { displayBaseUrl } from "@/domain/registry/registry-types";
import { useRegistryTask } from "./useRegistryTask";
import { ConnectionCard, ConnectionError, RegistryVersion } from "./ConnectionShared";

export function ConnectionsList({ onOpen }: { onOpen: (id: string | null) => void }) {
  const task = useRegistryTask<Awaited<ReturnType<typeof listConnections>>>();
  const refresh = () => { void task.run(signal => listConnections({ signal })); };
  useEffect(refresh, []);
  return <div className="space-y-3">
    <div className="mist-glass flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2">
      <p className="text-xs text-muted-foreground">连接管理 · 不修改已有模型分配</p>
      <div className="flex gap-2"><Button variant="outline" onClick={refresh} disabled={task.state.status === "loading"}>刷新列表</Button><Button onClick={() => onOpen(null)}>新增连接</Button></div>
    </div>
    <ConnectionError error={task.state.error} onRetry={refresh} />
    {task.state.status === "loading" && <p role="status" className="text-xs">正在读取连接…</p>}
    {task.state.data && <>
      <RegistryVersion value={task.state.data} />
      {task.state.data.connections.length === 0 && <ConnectionCard title="暂无连接"><p className="text-xs text-muted-foreground">可新增连接；页面不会自动迁移或创建配置。</p></ConnectionCard>}
      <div className="grid items-start gap-3 xl:grid-cols-2">
        {task.state.data.connections.map(connection => <ConnectionCard key={connection.id} title={connection.name}>
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{connection.enabled ? "已启用" : "已停用"}</Badge><Badge variant="outline">{connection.credential.configured ? "Key 已配置" : "Key 未配置"}</Badge></div>
          <dl className="space-y-1 break-all text-xs text-muted-strong">
            <div><dt className="inline text-muted-foreground">Base URL：</dt><dd className="inline">{displayBaseUrl(connection.base_url) || "未填写"}</dd></div>
            <div><dt className="inline text-muted-foreground">Transport：</dt><dd className="inline">{connection.transport}</dd></div>
            {connection.default_model && <div><dt className="inline text-muted-foreground">模型预填：</dt><dd className="inline">{connection.default_model}</dd></div>}
          </dl>
          <Button variant="outline" onClick={() => onOpen(connection.id)} aria-label={`管理连接：${connection.name}`}>详情与管理</Button>
        </ConnectionCard>)}
      </div>
    </>}
  </div>;
}
