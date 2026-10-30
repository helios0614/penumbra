// Presentation only: keep app IDs, routes, widget registrations and saved layouts.
const PLACEHOLDER_APPS = new Set(["notes", "music", "weather"]);
const HIDDEN_WIDGETS = new Set([...PLACEHOLDER_APPS, "chat", "calendar", "todo"]);

export function isDesktopShortcutVisible(appId: string): boolean {
  return !PLACEHOLDER_APPS.has(appId);
}

export function isDesktopWidgetVisible(widgetId: string): boolean {
  return !HIDDEN_WIDGETS.has(widgetId);
}
