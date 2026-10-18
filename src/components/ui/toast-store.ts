export type ToastType = "success" | "info" | "error";
export interface ToastInput {
  readonly type: ToastType;
  readonly text: string;
  readonly description?: string;
  readonly dedupeKey?: string;
  readonly duration?: number;
}
export interface ToastItem extends ToastInput { readonly id: number; readonly scope: string }
export interface ToastSnapshot { readonly items: readonly ToastItem[]; readonly announcement: string }
export const TOAST_LIMIT = 2;
export const toastDuration = (input: ToastInput) => Math.max(1000, Number.isFinite(input.duration) ? input.duration! : input.type === "success" ? 3000 : input.type === "info" ? 4000 : 5000);

/** Local to a host: no transport dependencies, global queue or promise-success inference. */
export function createToastStore() {
  let snapshot: ToastSnapshot = { items: [], announcement: "" }, sequence = 0, paused = false, disposed = false;
  const listeners = new Set<() => void>();
  const timers = new Map<number, { timer?: ReturnType<typeof setTimeout>; remaining: number; started: number }>();
  const publish = (items: readonly ToastItem[], announcement = snapshot.announcement) => {
    snapshot = { items, announcement }; listeners.forEach((listener) => listener());
  };
  const remove = (id: number) => {
    clearTimeout(timers.get(id)?.timer); timers.delete(id);
    const items = snapshot.items.filter((item) => item.id !== id);
    publish(items, items.length ? snapshot.announcement : "");
  };
  const arm = (id: number, remaining: number) => {
    clearTimeout(timers.get(id)?.timer);
    timers.set(id, { remaining, started: Date.now(), timer: paused ? undefined : setTimeout(() => remove(id), remaining) });
  };
  return {
    activate() { disposed = false; },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    show(input: ToastInput, scope = "page") {
      if (disposed || !input.text.trim()) return null;
      const key = input.dedupeKey ?? `${input.type}:${input.text}:${input.description ?? ""}`;
      const previous = snapshot.items.find((item) => item.scope === scope && (item.dedupeKey ?? `${item.type}:${item.text}:${item.description ?? ""}`) === key);
      const item = { ...input, id: previous?.id ?? ++sequence, scope };
      const items = previous ? snapshot.items.map((value) => value.id === previous.id ? item : value) : [...snapshot.items, item];
      while (items.length > TOAST_LIMIT) { const oldest = items.shift()!; clearTimeout(timers.get(oldest.id)?.timer); timers.delete(oldest.id); }
      const announcement = [item.text, item.description].filter(Boolean).join("。 ");
      // Unchanged text is not mutated in the live region when a repeated result extends its timer.
      arm(item.id, toastDuration(input));
      publish(items, paused ? "" : announcement);
      return item.id;
    },
    dismiss: remove,
    clearScope(scope: string) { snapshot.items.filter((item) => item.scope === scope).forEach((item) => remove(item.id)); },
    pause(value: boolean) {
      if (paused === value || disposed) return;
      paused = value;
      for (const [id, entry] of timers) {
        if (value) { clearTimeout(entry.timer); entry.remaining = Math.max(1, entry.remaining - (Date.now() - entry.started)); }
        else arm(id, entry.remaining);
      }
      if (!value && snapshot.items.length) {
        const item = snapshot.items[snapshot.items.length - 1];
        publish(snapshot.items, [item.text, item.description].filter(Boolean).join("。 "));
      }
    },
    dispose() { disposed = true; paused = false; timers.forEach((entry) => clearTimeout(entry.timer)); timers.clear(); listeners.clear(); snapshot = { items: [], announcement: "" }; },
  };
}
export type ToastStore = ReturnType<typeof createToastStore>;

export function createToastScope(store: ToastStore | null, scope: string) {
  let active = true;
  return {
    activate() { active = true; },
    show: (input: ToastInput) => active ? store?.show(input, scope) ?? null : null,
    dismiss: (id: number) => { if (active) store?.dismiss(id); },
    clear: () => store?.clearScope(scope),
    dispose() { active = false; store?.clearScope(scope); },
  };
}
