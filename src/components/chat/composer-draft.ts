export type SenderDraft = { readonly value: string; readonly recoveryDrafts: readonly string[] };
export type SenderHandle = { append(text: string): boolean };

/** Keep both sources intact, adding only the missing paragraph separator. */
export function appendComposerText(draft: string, text: string): string {
  if (!text.trim()) return draft;
  if (!draft) return text;
  const trailing = draft.match(/\n*$/)?.[0].length ?? 0;
  const leading = text.match(/^\n*/)?.[0].length ?? 0;
  return draft + "\n".repeat(Math.max(0, 2 - trailing - leading)) + text;
}
