import type { QuickNoteLog } from "@/domain/quick-note";

export type QuickNoteLogTone = "info" | "success" | "warning" | "error";

export const QUICK_NOTE_LOG_COLORS: Record<QuickNoteLogTone, string> = {
  info: "text-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  error: "text-destructive-foreground",
};

// This describes one log line, never the state of a generation or connection.
export function quickNoteLogTone(entry: Pick<QuickNoteLog, "level" | "message">): QuickNoteLogTone {
  const level = entry.level.trim().toLowerCase();
  const message = entry.message;
  if (["error", "fatal", "critical", "exception", "failed", "failure"].includes(level)
    || /失败|错误|异常|超时|无法|未能|未成功|未完成.*(?:[45]\d\d|中断|终止)|\b(?:error|failed|failure|exception|fatal|timeout)\b|[✗✘❌]/i.test(message)) return "error";
  if (["warn", "warning"].includes(level)) return "warning";
  if (["success", "succeeded"].includes(level)) return "success";
  if (/警告|⚠|\bwarning\b/i.test(message)) return "warning";
  if (/等待|尚未|未完成|预计|待执行|准备|正在|\b(?:waiting|pending|not|in progress)\b/i.test(message)) return "info";
  if (/已完成|已成功|成功(?:写入|保存|生成|调用)|(?:Step\s*[12]|速记|生成|压缩|整理|保存|写入|补写|处理|调用|任务)\s*[：:]?\s*(?:完成|成功)|\b(?:completed|succeeded)\b|[✓✔✅]/i.test(message)) return "success";
  return "info";
}

export function quickNoteLogTime(seconds: number, timeZone?: string) {
  const iso = new Date(seconds * 1000).toISOString();
  // While config is unavailable, do not substitute the browser's local zone.
  if (!timeZone) return { clock: "—", full: iso, iso };
  const clockOptions: Intl.DateTimeFormatOptions = { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };
  return {
    clock: new Intl.DateTimeFormat("zh-CN", clockOptions).format(seconds * 1000),
    full: new Intl.DateTimeFormat("zh-CN", { ...clockOptions, year: "numeric", month: "2-digit", day: "2-digit" }).format(seconds * 1000),
    iso,
  };
}
