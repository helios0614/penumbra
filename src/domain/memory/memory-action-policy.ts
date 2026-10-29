import type { Memory } from "./memory-types";

/** Product visibility rule for the stored type, not the rendered label or body.
 * MEMORY_WRITE persists `${ai_name}总结`. Match that type family so both
 * configured and historical names work, without fetching today's worldbook.
 * Other types still require the backend's independent source preflight.
 */
export function allowsMemorySourceActions(memory: Pick<Memory, "type">): boolean {
  return !memory.type?.endsWith("总结");
}
