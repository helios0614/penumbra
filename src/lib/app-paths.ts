/** Penumbra navigation only; backend URLs keep their own root paths. */
export type DesktopLayout = "classic" | "editorial";

export function getAppBasePath(baseUrl = import.meta.env.BASE_URL): string {
  const prefix = baseUrl.replace(/^\/+|\/+$/g, "");
  return prefix ? `/${prefix}/` : "/";
}

/** Remove only the application's complete prefix, never a sibling path. */
export function getAppPathname(
  pathname: string,
  baseUrl = import.meta.env.BASE_URL,
): string | null {
  const base = getAppBasePath(baseUrl);
  if (base === "/") return pathname;
  if (pathname === base.slice(0, -1)) return "/";
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : null;
}

export function getDesktopPath(
  layout: DesktopLayout = "classic",
  baseUrl = import.meta.env.BASE_URL,
): string {
  const base = getAppBasePath(baseUrl);
  return layout === "editorial" ? `${base}editorial` : base;
}

export function getDesktopAppPath(
  appId: string,
  layout: DesktopLayout = "classic",
  baseUrl = import.meta.env.BASE_URL,
): string {
  const desktop = getDesktopPath(layout, baseUrl);
  const prefix = desktop.endsWith("/") ? desktop : `${desktop}/`;
  return `${prefix}app/${encodeURIComponent(appId)}`;
}

export function getDesktopAppId(
  pathname: string,
  layout: DesktopLayout = "classic",
  baseUrl = import.meta.env.BASE_URL,
): string | null {
  const localPath = getAppPathname(pathname, baseUrl);
  const pattern = layout === "editorial"
    ? /^\/editorial\/app\/([^/]+)\/?$/
    : /^\/app\/([^/]+)\/?$/;
  return localPath?.match(pattern)?.[1] ?? null;
}
