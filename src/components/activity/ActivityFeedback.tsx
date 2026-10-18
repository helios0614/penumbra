import type { ActivityReads, ActivityState } from "@/application/activity/activity-state";
import type { ActivityController } from "@/application/activity/activity-controller";
import type { ActivityConnectionState } from "@/application/activity/activity-realtime";
import { activityReadGroup } from "@/application/activity/activity-feedback";
import { Button } from "@/components/ui/button";

export function ActivityReadIssue({ state, name, text, onRetry }: { readonly state: ActivityState; readonly name: keyof ActivityReads; readonly text: string; readonly onRetry: () => void }) {
  const read = state[name];
  if (!read.error) return null;
  const grouped = activityReadGroup(state).includes(name);
  const retryLabel = { phone: "重新读取手机状态", visibility: "重新读取权限", wifi: "重新读取标记", dates: "重新读取日期", logs: "重新读取活动", legacyEnabled: "重新读取配置", summary: "重新读取摘要" }[name];
  return <div className="py-2 text-xs leading-5 text-muted-strong" role={grouped ? undefined : "status"}>
    <div className="flex flex-wrap items-center justify-between gap-2"><p>{text}{read.data !== null && name === "logs" ? "，保留上次记录。" : ""}</p>
      {!grouped && <Button variant="ghost" className="h-11 text-xs" disabled={read.loading} onClick={onRetry}>{retryLabel}</Button>}
    </div>
    {!grouped && <details className="text-muted-foreground"><summary className="cursor-pointer py-1">排查信息</summary><p className="break-words">{read.error} {read.failure?.code} {read.failure?.status || ""} {read.failure?.message}</p></details>}
  </div>;
}
export function ActivityPageFeedback({ state, controller, connection, reconnect }: { readonly state: ActivityState; readonly controller: ActivityController | null; readonly connection: ActivityConnectionState; readonly reconnect: () => void }) {
  const grouped = activityReadGroup(state), disconnected = connection === "blocked" || connection === "reconnecting";
  const busy = grouped.some((key) => state[key].loading);
  if (!grouped.length && !disconnected) return null;
  const text = grouped.length ? "连接异常，部分信息暂不可用" : connection === "blocked" ? "实时连接受限，请检查登录状态" : "实时连接中断，正在重连";
  return <section className="mist-glass-strong rounded-[24px] px-4 py-3 text-xs leading-5 text-muted-strong" aria-label="活动连接状态" role="status">
    <div className="flex flex-wrap items-center justify-between gap-2"><p>{text}</p><Button variant="soft-primary" disabled={busy || Boolean(state.pending)} onClick={() => { if (grouped.length) void controller?.refresh(); if (disconnected) reconnect(); }}>{grouped.length ? disconnected ? "重新读取并恢复连接" : "重新读取" : "重新连接"}</Button></div>
    {grouped.length > 0 && <details className="text-muted-foreground"><summary className="cursor-pointer py-1">排查信息</summary>
      {grouped.map((key) => <p key={key} className="break-words">{key === "legacyEnabled" ? "AI 活动参考：暂时无法确认状态" : key}：{state[key].failure?.code} {state[key].failure?.status || ""} {state[key].failure?.message}</p>)}
      {disconnected && <p>{connection === "blocked" ? "实时连接受限，请检查登录状态。" : "实时连接正在恢复。"}</p>}
    </details>}
  </section>;
}
