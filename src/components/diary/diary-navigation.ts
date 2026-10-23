export function restoreDiaryCalendar(
  viewport: Pick<HTMLDivElement, "scrollTop" | "scrollHeight" | "clientHeight" | "focus"> | null,
  scrollTop: number,
  trigger: Pick<HTMLButtonElement, "isConnected" | "disabled" | "focus"> | null,
) {
  if (!viewport) return;
  viewport.scrollTop = Math.min(Math.max(0, scrollTop), Math.max(0, viewport.scrollHeight - viewport.clientHeight));
  if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
  else viewport.focus({ preventScroll: true });
}
