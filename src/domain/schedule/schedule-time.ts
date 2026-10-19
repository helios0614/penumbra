/** Server-local calendar text, never interpreted in the browser's timezone. */
export function validDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function validTime(value: string): boolean {
  return /^[0-9]{2}:[0-9]{2}$/.test(value) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60;
}
export function validMinute(value: string): boolean {
  return value.length === 16 && /^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}$/.test(value)
    && validDate(value.slice(0, 10)) && validTime(value.slice(11));
}
export function scheduleTime(value: string): string {
  if (!value) return "未填写时间";
  if (validDate(value)) return value;
  if (validMinute(value)) return value.replace("T", " ");
  return `时间格式异常：${value}`;
}
export function composeScheduleTime(date: string, time: string, required: boolean): string | undefined {
  if (!date && !time && !required) return undefined;
  if (!validDate(date)) throw new Error("请选择有效日期。");
  if (!time && !required) return date;
  if (!validTime(time)) throw new Error("请选择有效的小时和分钟。");
  return `${date} ${time}`;
}
