export function isDiaryMonth(value: string): boolean {
  return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1;
}

export function diaryMonthDays(month: string): number {
  if (!isDiaryMonth(month)) throw new RangeError("Invalid Diary month");
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1];
}

export function isDiaryDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || !isDiaryMonth(value.slice(0, 7))) return false;
  const day = Number(value.slice(8));
  return day >= 1 && day <= diaryMonthDays(value.slice(0, 7));
}

export function diaryDate(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Business dates remain strings. Gregorian arithmetic avoids UTC/local conversions and years 0–99 quirks. */
export function diaryWeekday(date: string): number {
  if (!isDiaryDate(date)) throw new RangeError("Invalid Diary date");
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const previous = year - 1;
  let days = previous * 365 + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400);
  for (let number = 1; number < month; number++) days += diaryMonthDays(`${date.slice(0, 4)}-${String(number).padStart(2, "0")}`);
  return (days + Number(date.slice(8)) - 1) % 7; // 0001-01-01 is Monday.
}

export function shiftDiaryMonth(month: string, delta: number): string | null {
  if (!isDiaryMonth(month) || !Number.isInteger(delta)) return null;
  const index = (Number(month.slice(0, 4)) - 1) * 12 + Number(month.slice(5)) - 1 + delta;
  if (index < 0 || index >= 9999 * 12) return null;
  return `${String(Math.floor(index / 12) + 1).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

export function localDiaryDate(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
