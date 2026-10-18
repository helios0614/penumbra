// Shared interaction rules, not a layout or business-state abstraction.
export type ControlSize = "compact" | "default" | "comfortable";

export const CONTROL_FOCUS =
  "focus-visible:border-ring/55 focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-ring/20";

export const CONTROL_HEIGHTS: Record<ControlSize, string> = {
  compact: "h-auto min-h-8 py-1",
  default: "h-auto min-h-10 py-2",
  comfortable: "h-auto min-h-11 py-2.5",
};
