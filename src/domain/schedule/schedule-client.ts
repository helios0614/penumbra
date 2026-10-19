import { apiGet, apiPost, apiRequest, type ApiRequestOptions } from "@/lib/api";
import { parseSchedule, parseScheduleList, requireScheduleAck } from "./schedule-mappers";
import { ScheduleContractError, type ScheduleInput } from "./schedule-types";
import { validDate, validMinute } from "./schedule-time";

const endpoint = "/api/schedules";
export async function listSchedules(options?: ApiRequestOptions) {
  return parseScheduleList(await apiGet<unknown>(endpoint, { ...options, cache: "no-store" }));
}
export async function listTodos(options?: ApiRequestOptions) {
  return parseScheduleList(await apiGet<unknown>(`${endpoint}/todo`, { ...options, cache: "no-store" }));
}
export async function createSchedule(input: ScheduleInput, options?: ApiRequestOptions) {
  const content = input.content.trim();
  if (!content || !["reminder", "todo", "alarm", "monitor"].includes(input.kind)) throw new ScheduleContractError("请填写内容并选择支持的类型。");
  if ((input.kind === "alarm" || input.kind === "monitor") && (!input.triggerAt || !validMinute(input.triggerAt))) throw new ScheduleContractError("闹钟和查岗需要精确到分钟的日期时间。");
  if (input.triggerAt && input.kind === "reminder" && !validDate(input.triggerAt) && !validMinute(input.triggerAt)) throw new ScheduleContractError("日期时间无效。");
  const raw = await apiPost<unknown>(endpoint, { type: input.kind, content,
    ...(input.triggerAt ? { trigger_at: input.triggerAt.replace("T", " ") } : {}) }, options);
  const item = parseSchedule(raw);
  const expectedTime = input.triggerAt?.replace("T", " ");
  if (!item || item.kind !== input.kind || item.content !== content || !["active", "triggered"].includes(item.status)
    || expectedTime !== undefined && item.triggerAt !== expectedTime) throw new ScheduleContractError("创建响应无法核对，请先刷新列表，避免重复创建。");
  return item;
}
export async function mutateSchedule(id: string, action: "done" | "restore" | "cancel", options?: ApiRequestOptions) {
  if (!id.trim()) throw new ScheduleContractError();
  const path = `${endpoint}/${encodeURIComponent(id)}${action === "cancel" ? "" : `/${action}`}`;
  requireScheduleAck(await apiRequest<unknown>(path, { ...options, method: action === "cancel" ? "DELETE" : "PATCH" }));
}
