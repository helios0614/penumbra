import type { ActivityReads, ActivityState } from "./activity-state";

export const ACTIVITY_PAGE_READS = ["phone", "visibility", "wifi", "dates", "legacyEnabled", "logs"] as const;
/** Same-origin HTTP reads, grouped only by structured transport failure or shared unauthenticated session (401).
 * 403, timeouts, 5xx and contract errors may be endpoint-specific and remain independent. */
export function activityReadGroup(state: ActivityState): readonly (keyof ActivityReads)[] {
  const groups = new Map<string, (keyof ActivityReads)[]>();
  for (const key of ACTIVITY_PAGE_READS) {
    const read = state[key], failure = read.failure;
    if (!read.error || !failure || failure.kind === "other") continue;
    const groupKey = failure.kind === "auth" ? `auth:${failure.status}` : "network";
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), key]);
  }
  return [...groups.values()].filter((keys) => keys.length > 1).flat();
}
