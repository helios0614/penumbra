import { useEffect } from "react";
import { getConnectionReferences } from "@/domain/registry/registry-client";
import type { ConnectionReferences as References } from "@/domain/registry/registry-types";
import { Button } from "@/components/ui/button";
import { ConnectionError } from "./ConnectionShared";
import { useRegistryTask } from "./useRegistryTask";

const scopes: Readonly<Record<string, string>> = { feature: "Feature Binding", main: "Main Conversation", diary: "Diary Entry",
  theater: "Theater Conversation", theater_persona: "Theater Persona", game: "Game Session", legacy_compatibility: "Legacy compatibility" };
export function ConnectionReferenceFacts({ value }: { value: References }) {
  return <div className="space-y-2 text-xs">
    <p>{value.references.length} 项引用 · {value.unresolved.length} 项无法解析</p>
    <ul className="space-y-1 text-muted-strong">
      {value.references.map((ref, index) => <li key={index} className="break-all">{Object.prototype.hasOwnProperty.call(scopes, ref.scope) ? scopes[ref.scope] : "其他引用"} · {ref.id}</li>)}
      {value.unresolved.map((ref, index) => <li key={`u${index}`} className="break-all text-warning">无法解析 · {Object.prototype.hasOwnProperty.call(scopes, ref.scope) ? scopes[ref.scope] : "其他引用"} · {ref.id}</li>)}
    </ul>
  </div>;
}
export function ConnectionReferences({ id }: { id: string }) {
  const task = useRegistryTask<References>();
  const refresh = () => { void task.run(signal => getConnectionReferences(id, { signal })); };
  useEffect(refresh, [id]);
  return <section aria-label="引用关系" className="space-y-2">
    <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-medium">引用关系</h4>
      <Button variant="ghost" size="sm" onClick={refresh} disabled={task.state.status === "loading"}>重新读取引用</Button></div>
    {task.state.status === "loading" && <p role="status" className="text-xs">正在核对引用…</p>}
    <ConnectionError error={task.state.error} onRetry={refresh} />
    {task.state.data && <ConnectionReferenceFacts value={task.state.data} />}
    <p className="text-xs text-muted-foreground">引用失败或无法解析不等于无引用，删除前将再次核对。</p>
  </section>;
}
