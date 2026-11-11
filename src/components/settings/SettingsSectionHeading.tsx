import { cn } from "@/lib/utils";

export function SettingsSectionHeading({
  title,
  description,
  descriptionClassName,
}: {
  title: string;
  description: string;
  descriptionClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className={cn("mt-1 text-xs text-muted-foreground", descriptionClassName)}>
        {description}
      </p>
    </div>
  );
}
