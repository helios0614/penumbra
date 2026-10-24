import { Activity, BookHeart, CalendarClock, Camera, FileText, Globe, ListChecks, MapPin, Music, Sparkles, Wrench } from "lucide-react";

/** Only adapter-authored types select an icon; never inspect legacy prose. */
export function CapabilityIcon({ capability, className }: { capability?: string; className?: string }) {
  const Icon = capability === "MEMORY_WRITE" ? BookHeart
    : ["TODO", "TODO_DONE"].includes(capability ?? "") ? ListChecks
    : ["ALARM", "REMINDER", "Monitor", "SCHEDULE_DEL", "schedule_wake", "schedule_alarm", "schedule_monitor"].includes(capability ?? "") ? CalendarClock
    : capability === "ACTIVITY_CHECK" ? Activity
    : ["Location", "location_sentinel", "activity_location", "POI_SEARCH", "ROUTE_PLAN"].includes(capability ?? "") ? MapPin
    : ["CAM_CHECK", "camera_legacy", "camera_sentinel"].includes(capability ?? "") ? Camera
    : ["MCP", "tools"].includes(capability ?? "") ? Wrench
    : ["WEBSEARCH", "URL_READ"].includes(capability ?? "") ? Globe
    : capability === "MUSIC" ? Music
    : ["keepalive_day", "keepalive_night"].includes(capability ?? "") ? Sparkles : FileText;
  return <Icon aria-hidden="true" className={className} />;
}
