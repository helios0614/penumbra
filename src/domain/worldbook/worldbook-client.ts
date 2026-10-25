import { apiGet } from "@/lib/api";

/** Read only the display name; persona contents stay outside the chat UI. */
export async function getUserDisplayName(signal?: AbortSignal): Promise<string> {
  const worldbook = await apiGet<unknown>("/api/worldbook", { signal });
  if (!worldbook || typeof worldbook !== "object" || !("user_name" in worldbook)) return "你";
  const name = worldbook.user_name;
  return typeof name === "string" && name.trim() ? name.trim() : "你";
}
