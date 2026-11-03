import { useEffect } from "react";
import { getConnectionReferences } from "@/domain/registry/registry-client";
import type { ConnectionReferences as References } from "@/domain/registry/registry-types";
import { Button } from "@/components/ui/button";
import { ConnectionError } from "./ConnectionShared";
import { useRegistryTask } from "./useRegistryTask";

const scopes: Readonly<Record<string, string>> = { feature: "功能分配", main: "聊天", diary: "日记",
  theater: "剧场", theater_persona: "剧场角色", game: "游戏", legacy_compatibility: "旧版兼容配置" };
const features: Readonly<Record<string, string>> = { main_chat: "聊天", memory_sentinel: "记忆哨兵", memory_digest: "记忆整理", web_compression: "Web 压缩", quick_note_compression: "速记压缩", camera_sentinel: "摄像头哨兵", location_sentinel: "位置哨兵", book_annotation: "书籍批注", game_decision: "游戏决策" };
const label = (ref: {scope: string; id: string}) => ref.scope === "feature" && Object.prototype.hasOwnProperty.call(features, ref.id) ? features[ref.id] : `${Object.prototype.hasOwnProperty.call(scopes, ref.scope) ? scopes[ref.scope] : ref.scope} · ${ref.id}`;
export function ConnectionReferenceFacts({ value }: { value: References }) {
  return <div className="space-y-2 text-xs">
    <p>{value.references.length} 项引用 · {value.unresolved.length} 项无法解析</p>
    <ul className="space-y-1 text-muted-strong">
      {value.references.map((ref, index) => <li key={index} className="break-all">{label(ref)}</li>)}
      {value.unresolved.map((ref, index) => <li key={`u${index}`} className="break-all text-warning">无法解析 · {label(ref)}</li>)}
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
