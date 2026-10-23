import { diaryDate, diaryMonthDays, diaryWeekday, isDiaryDate, type DiaryCalendarItem } from "@/domain/diary";

export const DIARY_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function diaryCalendarWeeks(month: string): readonly (readonly (string | null)[])[] {
  const first = diaryWeekday(diaryDate(month, 1)), count = diaryMonthDays(month);
  const cells = Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, index) => {
    const day = index - first + 1;
    return day >= 1 && day <= count ? diaryDate(month, day) : null;
  });
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

export function diaryMonthLabel(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月`;
}

export function diaryDateLabel(date: string): string {
  return `${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
}

export function diaryDateWeekday(date: string): string {
  return `星期${DIARY_WEEKDAYS[diaryWeekday(date)]}`;
}

export function diaryTitle(title: string | null): string {
  return title?.trim() || "无标题";
}

export function diaryItemStatus(item: DiaryCalendarItem): string {
  if (item.calendarState === "archived") return "已归档";
  if (item.calendarState === "pending") return "尚未归档";
  return "日记记录状态异常";
}

export function diaryItemDescription(item: DiaryCalendarItem): string {
  if (item.calendarState === "pending") return item.hasSavedContent ? "有保存的正文草稿，尚未归档。" : "有日记会话记录，尚未归档。";
  if (item.invalidReason === "done_without_content") return "记录标为完成，但没有有效的已保存正文。";
  if (item.invalidReason === "unknown_entry_status") return "记录的保存状态无法确认。";
  if (item.invalidReason === "invalid_business_date") return "保存的日期无法对应到日历，请核对原记录。";
  return "";
}

export function diaryUndatedItems(items: readonly DiaryCalendarItem[]): readonly DiaryCalendarItem[] {
  return items.filter((item) => !isDiaryDate(item.date));
}
