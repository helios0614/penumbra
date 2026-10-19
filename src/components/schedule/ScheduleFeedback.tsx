import type { ScheduleController, ScheduleState } from "@/application/schedule/schedule-controller";
import { Button } from "@/components/ui/button";

export function ScheduleIssue({ state, controller }: { readonly state: ScheduleState; readonly controller: ScheduleController | null }) {
  if (!state.issue) return null;
  return <div role="alert" className="rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-xs leading-5 text-foreground">
    <p>{state.issue.text}</p>
    <div className="mt-1 flex flex-wrap gap-2">
      <Button variant="soft-primary" size="compact" disabled={Boolean(state.pending) || state.loading} onClick={() => void controller?.checkIssue()}>重新读取核对</Button>
      <Button variant="ghost" size="compact" disabled={Boolean(state.pending)} onClick={() => controller?.acknowledgeIssue()}>{state.issue.id ? "保留当前状态，关闭提示" : "已核对列表，允许继续新建"}</Button>
    </div>
  </div>;
}
