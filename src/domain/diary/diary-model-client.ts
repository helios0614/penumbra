import { apiGet, apiRequest, type ApiRequestOptions } from "@/lib/api";
import { mapMainConfiguration, mapMainSelection, mainSelectionWire, type MainConfiguration, type MainSelection } from "@/domain/runtime/main-configuration";
import { DiaryContractError } from "./diary-types";

export type DiaryModelSelection = Extract<MainSelection, { connectionId: string }>;
export interface DiaryModelConfiguration {
  readonly entryId: string;
  readonly independent: boolean;
  readonly saved: MainSelection | null;
  readonly display: MainConfiguration;
}
export function parseDiaryModelConfiguration(input: unknown, entryId: string): DiaryModelConfiguration {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DiaryContractError();
  const row = input as Record<string, unknown>;
  if (row.scope !== "diary" || row.id !== entryId || row.editable !== true || !["explicit", "legacy_catalog", "legacy_unselected"].includes(row.source as string) || !("effective_selection" in row) || !("effective_diagnostic" in row)) throw new DiaryContractError();
  const independent = row.source === "explicit";
  const saved = independent ? mapMainSelection(row.selection) : null;
  if (independent && !saved && !row.effective_diagnostic) throw new DiaryContractError();
  // Compatibility may be effective, but it is never projected as a saved Entry choice.
  return { entryId, independent, saved, display: mapMainConfiguration({
    connection_selection: row.effective_selection ?? (independent ? row.selection : null),
    diagnostic: row.effective_diagnostic,
    connections: row.connections, allowed_protocols: row.allowed_protocols,
  }) };
}
function path(entryId: string) {
  if (!entryId.trim()) throw new DiaryContractError();
  return `/api/registry/selections/diary/${encodeURIComponent(entryId)}`;
}
export async function getDiaryModelConfiguration(entryId: string, options?: ApiRequestOptions) {
  return parseDiaryModelConfiguration(await apiGet<unknown>(path(entryId), { ...options, cache: "no-store" }), entryId);
}
export async function saveDiaryModelConfiguration(entryId: string, selection: DiaryModelSelection, options?: ApiRequestOptions) {
  const result = parseDiaryModelConfiguration(await apiRequest<unknown>(path(entryId), { ...options, method: "PUT", body: mainSelectionWire(selection) }), entryId);
  const saved = result.saved;
  if (!result.independent || saved?.connectionId !== selection.connectionId || saved.protocol !== selection.protocol || saved.model !== selection.model) throw new DiaryContractError();
  return result;
}
