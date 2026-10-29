import { RefreshCw } from "lucide-react";
import { taskFailure, type MemoryManagementState } from "@/application/memory-management";
import { Button } from "@/components/ui/button";
export function MemoryManagementFeedback({ state, onRefreshTask }: { readonly state: MemoryManagementState; readonly onRefreshTask: (id: string) => void }) {
  const result = state.digestResult;
  if (!state.digestPending && !result && !state.digestError && !state.tasks.length) return null;
  return <div className="border-b border-primary/10 px-4 py-3 text-xs leading-6 sm:px-6" data-memory-management-feedback>
    {state.digestPending && <p role="status">正在批量总结，可能包含新增消息和已入队的历史来源，请稍候…</p>}
    {state.digestError && <p role="alert" className="text-destructive-foreground">{state.digestError.message}</p>}
    {result && <div role={result.ok ? "status" : "alert"}>
      <p className={result.ok ? "text-muted-strong" : "text-destructive-foreground"}>{result.message}</p>
      <p className="text-muted-foreground">新增 {result.newMemoriesCount} 条记忆 · 处理 {result.processedMessages} 条增量消息{result.historyCompletedTasks !== undefined && ` · 完成 ${result.historyCompletedTasks} 项历史任务`}{result.historyPendingTasks !== undefined && ` · 待总结 ${result.historyPendingTasks} 项`}</p>
    </div>}
    {state.tasks.map(({ task, reading, error }) => <div key={task.id} className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-primary/10 pt-2" data-memory-task={task.id}>
      <div className="min-w-0 flex-1 basis-40">
        <p role="status" className="text-muted-strong">{task.state === "completed" ? "来源总结已完成" : task.lastError ? "来源总结失败，任务仍待处理" : "来源已加入待总结队列"} · {task.sourceCount} 条来源消息</p>
        {task.state === "pending" && <p className="text-muted-foreground">{task.lastError ? `${taskFailure(task.lastError)}任务已保留。` : "尚未确认执行；可通过“总结新记忆”处理增量与历史队列。"}</p>}
        {error && <p role="alert" className="text-destructive-foreground">状态暂时无法读取，请稍后查询。</p>}
      </div>
      {task.state === "pending" && <Button variant="ghost" size="compact" disabled={reading} aria-busy={reading} onClick={() => onRefreshTask(task.id)}><RefreshCw className="size-3.5" aria-hidden="true" />查询状态</Button>}
    </div>)}
  </div>;
}
