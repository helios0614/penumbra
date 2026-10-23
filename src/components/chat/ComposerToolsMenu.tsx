import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { trackComposerMenuAnchor, type ComposerMenuAnchor } from "./composer-menu-anchor";

/** A single tools surface. Its caller owns the available tools and business state. */
export function ComposerToolsMenu({ anchor, inputRef, open, onOpenChange, label, children }: {
  anchor: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  const [trackedAnchor, setTrackedAnchor] = useState<ComposerMenuAnchor | null>(null);
  const [tracking, setTracking] = useState(open);
  useLayoutEffect(() => { if (open) setTracking(true); }, [open]);
  useLayoutEffect(() => {
    if (tracking && anchor.current) return trackComposerMenuAnchor(anchor.current, setTrackedAnchor);
  }, [tracking, anchor]);

  return <Popover open={open} onOpenChange={onOpenChange}
    onOpenChangeComplete={(next) => { if (!next && !open) setTracking(false); }}>
    <PopoverTrigger onPointerDown={(event) => {
      // Keep the caret, keyboard and an active composition when opening from the draft.
      if (document.activeElement === inputRef.current) event.preventDefault();
    }} render={<Button type="button" variant="ghost" size="icon-lg"
      className="chat-composer-tools size-11 rounded-full text-muted-foreground md:size-9"
      aria-label="会话工具" title={label} />}>
      <Plus className="size-5" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent keepMounted side="top" align="start" sideOffset={12}
      anchor={trackedAnchor ?? anchor} positionMethod="fixed"
      collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
      initialFocus={(type) => type === "keyboard"} finalFocus={(type) => type === "keyboard"}
      className="chat-composer-menu" aria-label="会话工具">
      <PopoverTitle className="sr-only">会话工具</PopoverTitle>
      {children}
    </PopoverContent>
  </Popover>;
}
