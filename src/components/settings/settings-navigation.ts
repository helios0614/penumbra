import { getDesktopAppId, getDesktopAppPath, getDesktopPath, type DesktopLayout } from "@/lib/app-paths";

export interface SettingsNavigationHost {
  readonly history: Pick<History, "state" | "pushState" | "replaceState" | "back" | "go">;
  readonly location: Pick<Location, "pathname" | "href">;
}
const marker = (layout: DesktopLayout) => layout === "classic" ? "penumbraApp" : "penumbraEditorialApp";
export const isSettingsPath = (pathname: string, layout: DesktopLayout) => getDesktopAppId(pathname, layout) === "settings";
const depth = (state: History["state"]) => Number.isSafeInteger(state?.penumbraSettingsDepth) && state.penumbraSettingsDepth >= 0 ? state.penumbraSettingsDepth as number : 0;

export function pushSettingsHistory(host: SettingsNavigationHost, layout: DesktopLayout) {
  host.history.pushState({ [marker(layout)]: "settings", penumbraSettingsDepth: 0, penumbraSettingsPath: [] }, "", getDesktopAppPath("settings", layout));
}

/** Close the whole Settings stack, rather than returning to another category. */
export function closeSettingsHistory(host: SettingsNavigationHost, layout: DesktopLayout): boolean {
  if (host.history.state?.[marker(layout)] === "settings") {
    host.history.go(-(depth(host.history.state) + 1));
    return true;
  }
  // A direct link has no known in-app predecessor; never send it off-site.
  host.history.replaceState({}, "", getDesktopPath(layout));
  return false;
}

export function readSettingsPath(state: History["state"], pageIds: readonly string[]): readonly string[] {
  const path: unknown = state?.penumbraSettingsPath;
  return Array.isArray(path) && path.every(id => typeof id === "string" && pageIds.includes(id)) ? path : [];
}

export function pushSettingsPage(host: SettingsNavigationHost, path: readonly string[]) {
  if (!isSettingsPath(host.location.pathname, "classic") && !isSettingsPath(host.location.pathname, "editorial")) return;
  host.history.pushState({ ...host.history.state, penumbraSettingsPath: path, penumbraSettingsDepth: depth(host.history.state) + 1 }, "", host.location.href);
}

export function backSettingsPage(host: SettingsNavigationHost): boolean {
  if ((isSettingsPath(host.location.pathname, "classic") || isSettingsPath(host.location.pathname, "editorial")) && depth(host.history.state) > 0) {
    host.history.back();
    return true;
  }
  return false;
}
