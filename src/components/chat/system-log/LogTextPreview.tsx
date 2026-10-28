import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCopyFeedback } from "@/components/ui/copy-feedback";

/** Only the rendered lines are clipped. Selection/copy always use the original safe text. */
export function LogTextPreview({ text, label = "正文", copyable = false, collapse = true }: {
  text: string; label?: string; copyable?: boolean; collapse?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const content = useRef<HTMLParagraphElement>(null);
  const copy = useCopyFeedback(text);
  useLayoutEffect(() => {
    if (!collapse || expanded) return;
    const element = content.current;
    if (!element) return;
    const measure = () => { if (element.clientHeight) setOverflow(element.scrollHeight > element.clientHeight + 1); };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [text, collapse, expanded]);
  return <div className="system-log-preview">
    <p ref={content} className={`system-log-text system-log-prose ${collapse && !expanded ? "system-log-clamp" : ""}`} data-log-reading-anchor>{text}</p>
    {(overflow || expanded || copyable) && <div className="system-log-text-actions">
      {(overflow || expanded) && <Button size="xs" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "收起全文" : "展开全文"}</Button>}
      {copyable && <Button size="xs" variant="ghost" onClick={copy} aria-label={`复制 ${label}`}>复制</Button>}
    </div>}
  </div>;
}
