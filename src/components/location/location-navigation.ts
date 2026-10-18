export interface LocationNavigationHost {
  readonly history: Pick<History, "state" | "pushState" | "back">;
  readonly location: Pick<Location, "href">;
  addEventListener(type: string, listener: EventListener, capture?: boolean): void;
  removeEventListener(type: string, listener: EventListener, capture?: boolean): void;
}
// Feature-local guard: retain this app while its confirmation is open, before the desktop popstate handler runs.
export function createLocationNavigation(host: LocationNavigationHost, options: {
  readonly dirty: () => boolean; readonly busy: () => boolean;
  readonly confirm: (proceed: () => void) => void; readonly discard: () => void;
}) {
  const url = host.location.href, entry = host.history.state;
  const exit = (action: () => void) => {
    if (options.busy()) return;
    if (options.dirty()) options.confirm(() => { if (!options.busy()) { options.discard(); action(); } });
    else action();
  };
  const pop: EventListener = (event) => {
    if (!options.dirty() && !options.busy()) return;
    event.stopImmediatePropagation();
    host.history.pushState(entry, "", url);
    exit(() => host.history.back());
  };
  const unload: EventListener = (event) => {
    if (!options.dirty() && !options.busy()) return;
    event.preventDefault(); (event as BeforeUnloadEvent).returnValue = "";
  };
  host.addEventListener("popstate", pop, true);
  host.addEventListener("beforeunload", unload);
  return { exit, dispose() { host.removeEventListener("popstate", pop, true); host.removeEventListener("beforeunload", unload); } };
}
