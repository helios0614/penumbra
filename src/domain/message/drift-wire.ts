/** Canonical presence wins, including null/empty. Never fall back on conflict. */
export function readDriftWire(
  record: Record<string, unknown>,
  options: { readonly allowMissing?: boolean } = {},
): string | null {
  const hasCanonical = Object.prototype.hasOwnProperty.call(record, "drift");
  // HTTP projection can remove an empty physical column without adding drift.
  // Persisted receipts always declare the field and keep the strict default.
  if (options.allowMissing && !hasCanonical &&
      !Object.prototype.hasOwnProperty.call(record, "simple_think")) return null;
  const key = hasCanonical
    ? "drift"
    : "simple_think";
  const value = record[key];
  if (value !== null && typeof value !== "string") {
    throw new Error("Invalid DRIFT field");
  }
  return value;
}
