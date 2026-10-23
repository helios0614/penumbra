import { ApiError } from "@/lib/api";
import { DiaryContractError, DiaryUnavailableError, localDiaryDate, type ArchivedDiary, type DiaryCalendar } from "@/domain/diary";

export interface DiaryReader {
  readonly entryId: string;
  readonly date: string;
  readonly entry: ArchivedDiary | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export interface DiaryState {
  readonly month: string;
  readonly selectedDate: string;
  readonly calendar: DiaryCalendar | null;
  readonly calendarLoading: boolean;
  readonly calendarError: string | null;
  readonly preview: DiaryReader | null;
  readonly reader: DiaryReader | null;
  readonly notice: { readonly text: string } | null;
}

export function initialDiaryState(date = localDiaryDate()): DiaryState {
  return { month: date.slice(0, 7), selectedDate: date, calendar: null, calendarLoading: false, calendarError: null, preview: null, reader: null, notice: null };
}

export function diaryReadFailure(error: unknown): string {
  if (error instanceof DiaryUnavailableError || error instanceof DiaryContractError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "登录状态不可用，请登录后重新读取。";
    if (error.status === 404) return "日记读取服务或记录暂不可用，请重新读取。";
    if (error.code === "TIMEOUT") return "读取超时，请重试。";
    if (error.code === "NETWORK_ERROR") return "网络连接中断，请重试。";
  }
  return "暂时无法读取日记，请重试。";
}
