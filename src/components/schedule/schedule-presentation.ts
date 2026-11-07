import { validMinute, type ManagedScheduleKind, type Schedule } from "@/domain/schedule";

export const scheduleMeta = {
  reminder: { title: "记挂", eyebrow: "ON MY MIND", description: (aiName: string) => `${aiName}想持续放在心上的事情。`, create: "创建记挂", empty: "暂时没有记挂的事情", active: "持续关注" },
  todo: { title: "待办", eyebrow: "TO DO", description: () => "记下需要处理的事情，一件件完成。", create: "添加待办", empty: "暂时没有待办", active: "未完成" },
  alarm: { title: "闹钟", eyebrow: "ALARMS", description: (aiName: string) => `一次性提醒，到时间后由${aiName}回应。`, create: "创建闹钟", empty: "没有等待触发的闹钟", active: "等待触发" },
  monitor: { title: "定时查岗", eyebrow: "SCHEDULED CHECK-IN", description: (aiName: string) => `到指定时间，${aiName}会尝试查看一次摄像头。`, create: "创建查岗", empty: "没有等待触发的查岗", active: "等待触发" },
} as const;

export function selectSchedules(items: readonly Schedule[], kind: ManagedScheduleKind, status: Schedule["status"]): Schedule[] {
  return items.filter((item) => item.kind === kind && item.status === status).sort((a, b) => {
    if (kind === "alarm" || kind === "monitor") {
      const aValid = validMinute(a.triggerAt), bValid = validMinute(b.triggerAt);
      if (aValid !== bValid) return aValid ? -1 : 1;
      if (aValid) {
        const timeOrder = b.triggerAt.replace("T", " ").localeCompare(a.triggerAt.replace("T", " "));
        if (timeOrder) return timeOrder;
      }
    }
    return (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.id.localeCompare(b.id);
  });
}
