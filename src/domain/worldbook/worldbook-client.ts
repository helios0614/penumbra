import { apiGet } from "@/lib/api";

export const DEFAULT_DISPLAY_NAMES = { aiName: "AI", userName: "你" } as const;

function displayName(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

/** Project only the display names from the worldbook response. */
export async function getDisplayNames(signal?: AbortSignal) {
  const worldbook = await apiGet<unknown>("/api/worldbook", { signal, cache: "no-store" });
  if (!worldbook || typeof worldbook !== "object") return DEFAULT_DISPLAY_NAMES;
  const fields = worldbook as Record<string, unknown>;
  return {
    aiName: displayName(fields.ai_name, DEFAULT_DISPLAY_NAMES.aiName),
    userName: displayName(fields.user_name, DEFAULT_DISPLAY_NAMES.userName),
  };
}
