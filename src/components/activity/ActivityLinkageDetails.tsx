import type { ActivityController } from "@/application/activity/activity-controller";
import { activityReadGroup } from "@/application/activity/activity-feedback";
import type { ActivityState } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";

/** Read-only, infrequent status belongs in More; shared failures live in page diagnostics. */
export function ActivityLinkageDetails({ state, controller }: { readonly state: ActivityState; readonly controller: ActivityController | null }) {
  const read = state.legacyEnabled;
  if (activityReadGroup(state).includes("legacyEnabled")) return null;
  const label = read.loading ? "确认中…" : read.error ? "暂不可用" : read.data === true ? "已开启" : read.data === false ? "已关闭" : "尚未确认";
  return <details className="border-t border-primary/10 px-2 py-1 text-xs leading-5 text-muted-strong" aria-label="AI 活动参考" aria-busy={read.loading}>
    <summary className="min-h-11 cursor-pointer py-3">AI 活动参考<span className="ml-2 text-muted-foreground">{label}</span></summary>
    <div className="space-y-2 pb-2">
      <p>供 AI 了解近期活动，与手机状态读取权限独立；日志和本页规则摘要仍可查看。</p>
      {!read.loading && !read.error && read.data !== null && <p>此处仅查看状态，如需调整，请前往原有的活动联动设置。</p>}
      {read.error && !read.loading && <>
        <p role="status">暂时无法确认是否开启。</p>
        <details className="text-muted-foreground"><summary className="cursor-pointer py-1">排查信息</summary><p className="break-words">{read.error} {read.failure?.code} {read.failure?.status || ""} {read.failure?.message}</p></details>
      </>}
      <Button variant="ghost" className="h-11 px-2 text-xs" disabled={read.loading} onClick={() => void controller?.loadLegacy()}>重新确认</Button>
    </div>
  </details>;
}
