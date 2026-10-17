import type { ActivityDevice, ActivityRecord } from "@/domain/activity";
import { activityEventLabel } from "./activity-presentation";

const SYSTEM_EVENTS = new Set(["screen_on", "screen_off", "亮屏", "锁屏"]);
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const PC_PROCESS = /^[A-Za-z0-9_][A-Za-z0-9_. -]*\.exe$/i;
export const REPEAT_MAX_GAP_SECONDS = 180;
const DETAIL_PREVIEW_LENGTH = 96;

export interface ActivityEventDetails {
  readonly secondary: string | null;
  readonly preview: string | null;
  readonly detail: string | null;
}

export function activityEventDetails(event: ActivityRecord): ActivityEventDetails {
  const title = event.title.trim();
  if (!title || title === event.app.trim() || title === activityEventLabel(event).trim()
    || SYSTEM_EVENTS.has(event.app) && SYSTEM_EVENTS.has(title)) return { secondary: null, preview: null, detail: null };
  // Android sends the original package in title, while HTTP app is already resolved.
  // Package metadata is useful once, but is never an expandable duplicate detail.
  if (event.device === "phone" && ANDROID_PACKAGE.test(title)) return { secondary: event.title, preview: null, detail: null };
  const characters = Array.from(event.title);
  if (characters.length <= DETAIL_PREVIEW_LENGTH && !/[\r\n]/.test(event.title)) return { secondary: event.title, preview: null, detail: null };
  return { secondary: null, preview: `${characters.slice(0, DETAIL_PREVIEW_LENGTH).join("").split(/\r?\n/, 1)[0]}…`, detail: event.title };
}

export function activityRawAppIdentity(event: ActivityRecord): string | null {
  if (!event.app || SYSTEM_EVENTS.has(event.app) || SYSTEM_EVENTS.has(event.title)) return null;
  if (event.device === "phone") {
    const appIsPackage = ANDROID_PACKAGE.test(event.app), titleIsPackage = ANDROID_PACKAGE.test(event.title);
    // Conflicting purported identities are ambiguous: don't choose one.
    if (appIsPackage && titleIsPackage && event.app !== event.title) return null;
    if (titleIsPackage) return `android:${event.title}`;
    if (appIsPackage) return `android:${event.app}`;
  }
  // Some PC HTTP names have already become window titles; readable names alone
  // cannot recover the original process. Only an intact process name is eligible.
  if (event.device === "pc" && PC_PROCESS.test(event.app)) return `pc:${event.app}`;
  return null;
}

export type ActivityTimelineEntry =
  | { readonly kind: "event"; readonly key: string; readonly event: ActivityRecord }
  | { readonly kind: "repeat"; readonly key: string; readonly events: readonly ActivityRecord[] };

/** Display projection only. Input is the complete, time-sorted HTTP collection. */
export function projectActivityTimeline(records: readonly ActivityRecord[], timeZone?: string): readonly ActivityTimelineEntry[] {
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const result: ActivityTimelineEntry[] = [];
  let run: ActivityRecord[] = [], identity: string | null = null, localDate = "";
  const finish = () => {
    if (!run.length) return;
    if (run.length === 1) result.push({ kind: "event", key: `event:${run[0].key}`, event: run[0] });
    else result.push({ kind: "repeat", key: JSON.stringify(["repeat", run[0].device, identity, run[run.length-1].key]), events: run });
  };
  for (const event of records) {
    const nextIdentity = activityRawAppIdentity(event);
    const nextDate = nextIdentity ? date.format(event.timestamp * 1000) : "";
    const previous = run[run.length - 1];
    const gap = previous ? previous.timestamp - event.timestamp : -1;
    if (nextIdentity !== null && identity === nextIdentity && previous?.device === event.device
      && previous.date === event.date && localDate === nextDate
      && previous.title === event.title && gap >= 0 && gap <= REPEAT_MAX_GAP_SECONDS) {
      run.push(event);
    } else {
      finish(); run = [event]; identity = nextIdentity; localDate = nextDate;
    }
  }
  finish();
  return result;
}

export function timelineEvents(entry: ActivityTimelineEntry): readonly ActivityRecord[] {
  return entry.kind === "repeat" ? entry.events : [entry.event];
}

export function filterActivityTimeline(entries: readonly ActivityTimelineEntry[], device: ActivityDevice): readonly ActivityTimelineEntry[] {
  return device === "all" ? entries : entries.filter((entry) => timelineEvents(entry)[0].device === device);
}
