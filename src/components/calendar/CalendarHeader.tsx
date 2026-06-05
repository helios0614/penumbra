import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalendarHeaderProps {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  className?: string;
}

/** 月份导航 + 今天快捷按钮 */
export default function CalendarHeader({
  monthLabel,
  onPrev,
  onNext,
  onToday,
  className,
}: CalendarHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-3", className)}>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-strong hover:text-foreground hover:bg-surface-secondary rounded-sm"
          onClick={onPrev}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="text-sm font-semibold text-foreground min-w-[100px] text-center select-none">
          {monthLabel}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-strong hover:text-foreground hover:bg-surface-secondary rounded-sm"
          onClick={onNext}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-strong hover:text-foreground hover:bg-surface-secondary rounded-sm"
        onClick={onToday}
      >
        <CalendarDays className="size-3.5" />
        今天
      </Button>
    </div>
  );
}
