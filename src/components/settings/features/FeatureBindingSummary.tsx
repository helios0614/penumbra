import { featureStatus, protocolName, type FeatureBinding, type FeatureSelection } from "@/domain/registry/feature-bindings";

// Presentation follows the authoritative diagnostic, never Connection metadata.
export function FeatureStatus({ feature }: { feature: FeatureBinding }) {
  const unconfigured = ["feature_binding_required", "main_default_not_selected", "main_selection_required"].includes(feature.diagnostic ?? "");
  const tone = unconfigured ? "unconfigured" : feature.diagnostic || !feature.selection ? "warning" : "available";
  const colors = { unconfigured: "text-muted-foreground", warning: "text-warning-foreground", available: "text-success-foreground" };
  return <span data-feature-status={tone} className={`inline-flex items-center gap-1.5 text-xs leading-5 ${colors[tone]}`}>
    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tone === "available" ? "bg-success/60" : tone === "warning" ? "bg-warning/65" : "bg-muted-foreground/45"}`} />
    {tone === "available" ? "当前可用" : featureStatus(feature)}
  </span>;
}

export function ModelLiteral({ value }: { value: string }) {
  // Wrap only at identifier separators; a single oversized token may ellipsize.
  // Full literal remains in the DOM and native tooltip, without inserted spaces.
  const tokens = value.match(/[^/_-]+[/_-]?|[/_-]/g) ?? [value];
  return <p data-model-literal title={value} className="min-w-0 text-sm leading-6 text-foreground">{tokens.map((token, index) =>
    <span key={index}><span className="inline-block max-w-full truncate align-bottom">{token}</span><wbr /></span>)}
  </p>;
}

export function FeatureSelectionSummary({ selection, connectionName }: { selection: FeatureSelection; connectionName: string }) {
  return <div className="min-w-0 space-y-0.5">
    <p className="text-xs leading-5 text-muted-strong [overflow-wrap:anywhere]">{connectionName} · {protocolName(selection.protocol) || "协议为空"}</p>
    <ModelLiteral value={selection.model || "模型为空"} />
  </div>;
}
