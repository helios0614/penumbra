import type { CalendarEvent } from "./Calendar";

interface EventDotProps {
  events: CalendarEvent[];
  max?: number;
  selected?: boolean;
}

/** 日期格子内的事件指示点 */
export default function EventDot({ events, max = 3, selected }: EventDotProps) {
  if (!events.length) return null;

  return (
    <div className="flex gap-0.5">
      {events.slice(0, max).map((ev) => (
        <span
          key={ev.id}
          className="size-1 rounded-full"
          style={{ backgroundColor: selected ? "white" : ev.color ?? "var(--color-primary)" }}
        />
      ))}
    </div>
  );
}
