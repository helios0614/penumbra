export type RegeneratePersistenceProjection = {
  readonly id: string;
  readonly content: string;
  readonly thinking: string | null;
  readonly simpleThink: string | null;
};

type RegeneratePersistenceSource = {
  readonly id: string;
  readonly content: string;
  readonly thinking?: string | null;
  readonly simpleThink?: string | null;
};

export type ChatHistoryReconciliationResult = {
  readonly persistedMessageIds: readonly string[];
  readonly regenerateTarget: RegeneratePersistenceProjection | null;
};

export function createRegeneratePersistenceProjection(
  source: RegeneratePersistenceSource,
): RegeneratePersistenceProjection {
  return Object.freeze({
    id: source.id,
    content: source.content,
    thinking: normalizeOptionalText(source.thinking),
    simpleThink: normalizeOptionalText(source.simpleThink),
  });
}

export function areRegeneratePersistenceProjectionsEqual(
  left: RegeneratePersistenceProjection,
  right: RegeneratePersistenceProjection,
): boolean {
  return left.id === right.id &&
    left.content === right.content &&
    left.thinking === right.thinking &&
    left.simpleThink === right.simpleThink;
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  return value === undefined || value === null || value.length === 0
    ? null
    : value;
}
