import { apiGet, apiPost, type ApiRequestOptions } from "@/lib/api";
import { dateKey, parseActivityDates, parseActivityEnabled, parseActivityRecords, parseActivitySummary, parseClearedFiles } from "./activity-mappers";
import { ActivityContractError, type ActivityQuery } from "./activity-types";

export async function getActivityDates(options?: ApiRequestOptions) {
  return parseActivityDates(await apiGet<unknown>("/api/activity/dates", options));
}
export async function getActivityRecords(query: ActivityQuery, options?: ApiRequestOptions) {
  if (query.kind === "date") return parseActivityRecords(await apiGet<unknown>(`/api/activity/logs/${encodeURIComponent(dateKey(query.date))}`, options));
  if (!Number.isInteger(query.hours) || query.hours < 1) throw new ActivityContractError();
  return parseActivityRecords(await apiGet<unknown>("/api/activity/recent", { ...options, query: { hours: query.hours } }));
}
export async function getActivitySummary(options?: ApiRequestOptions) {
  return parseActivitySummary(await apiGet<unknown>("/api/activity/summary", { ...options, query: { hours: 3 } }));
}
export async function getActivityEnabled(options?: ApiRequestOptions) {
  return parseActivityEnabled(await apiGet<unknown>("/api/activity/config", options));
}
export async function clearActivityLogs(options?: ApiRequestOptions) {
  return parseClearedFiles(await apiPost<unknown>("/api/activity/clear", undefined, options));
}
