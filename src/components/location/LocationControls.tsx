import type { ComponentProps, ReactNode } from "react";
import type { LocationSaveSection } from "@/application/location/location-draft";
import type { LocationState } from "@/application/location/location-state";
import { Input } from "@/components/ui/input";

export function LocationField({ label, error, hint, hideLabel = false, ...props }: ComponentProps<typeof Input> & {
  readonly label: string; readonly error?: string; readonly hint?: ReactNode; readonly hideLabel?: boolean;
}) {
  const descriptionId = `${props.id}-description`;
  return <div className="min-w-0">
    <label htmlFor={props.id} className={hideLabel ? "sr-only" : "mb-1.5 block text-xs font-medium text-muted-strong"}>{label}</label>
    <Input surface="translucent" className="text-sm" {...props} aria-invalid={Boolean(error)} aria-describedby={error || hint ? descriptionId : undefined} />
    {(error || hint) && <p id={descriptionId} className={`mt-1 text-xs leading-5 ${error ? "text-destructive" : "text-muted-foreground"}`}>{error || hint}</p>}
  </div>;
}
export function LocationSaveError({ state, section }: { readonly state: LocationState; readonly section: LocationSaveSection }) {
  const feedback = state.feedback?.section === section ? state.feedback : null;
  if (!feedback?.error) return null;
  return <p className="mt-2 text-xs leading-5 text-destructive" role="alert">{feedback.text}</p>;
}
