import { Button } from "@/components/ui/button";
import type { ConnectionList, RegistryError } from "@/domain/registry/registry-types";

export function ConnectionError({ error, onRetry }: { error: RegistryError | null; onRetry?: () => void }) {
  if (!error) return null;
  return <div role="alert" className="space-y-2 rounded-xl bg-destructive/10 p-3 text-xs leading-relaxed text-foreground">
    <p>{error.message}</p>{onRetry && <Button size="sm" variant="outline" onClick={onRetry}>重新读取</Button>}
  </div>;
}
export function RegistryVersion({ value }: { value: ConnectionList }) {
  return <div className={value.migration_required || value.diagnosticCount || value.deferredCount ? "space-y-1 rounded-xl bg-warning/10 px-3 py-2 text-xs text-muted-strong" : "text-xs text-muted-foreground"} aria-label="Registry 版本状态">
    <p>Registry v{value.schema_version} · {value.authority_state === "persisted_v2" ? "已持久化 v2" : "只读投影 v2"}</p>
    {value.migration_required && <p>需要迁移：明确保存连接时，后端可能同时持久化 Registry v2。</p>}
    {(value.diagnosticCount > 0 || value.deferredCount > 0) && <p>{value.diagnosticCount} 项迁移诊断 · {value.deferredCount} 项延后绑定，需另行核对。</p>}
  </div>;
}
