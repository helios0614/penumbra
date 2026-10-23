export function GenerationIndicator({ label, active }: {
  readonly label: string;
  readonly active: boolean;
}) {
  return <div className="chat-generation" data-active={active} role="status" aria-live="polite">
    <span>{label}</span>
    {active && <span className="chat-generation-dots" aria-hidden="true"><i /><i /><i /></span>}
  </div>;
}
