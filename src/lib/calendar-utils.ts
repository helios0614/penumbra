/** 日历日期工具函数 — 零依赖，纯计算 */

/** 获取某月第一天是星期几（0=日, 1=一, ..., 6=六） */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** 获取某月有多少天 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 生成日历网格（6行 x 7列），上月/下月补位用 0 填充 */
export function generateCalendarGrid(
  year: number,
  month: number,
  weekStart: 0 | 1 = 1 // 0=周日开始, 1=周一开始
): number[][] {
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);

  // 调整星期起点
  const startOffset = weekStart === 0 ? firstDay : (firstDay + 6) % 7;

  const cells: number[] = [];

  // 上月补位
  const prevMonthDays = getDaysInMonth(year, month - 1);
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push(prevMonthDays - i);
  }

  // 本月日期
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  // 下月补位，凑满 6 行
  const totalRows = Math.ceil(cells.length / 7);
  const remaining = totalRows * 7 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push(d);
  }

  // 切成二维数组
  const grid: number[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    grid.push(cells.slice(i, i + 7));
  }

  return grid;
}

/** 判断两个日期是否是同一天 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 判断某天是否属于当前月份（用于网格中的补位判断） */
export function isCurrentMonth(
  day: number,
  rowIndex: number,
  firstDayOffset: number,
  daysInMonth: number
): boolean {
  const cellIndex = rowIndex * 7;
  if (cellIndex < firstDayOffset) return false; // 上月补位
  if (day > daysInMonth && rowIndex > 0) return false; // 下月补位
  return true;
}

/** 格式化日期为 YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 获取中文星期名 */
export const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];
export const WEEKDAYS_ZH_MON = ['一', '二', '三', '四', '五', '六', '日'];
