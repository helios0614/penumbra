import { useRef, type ReactNode } from "react";
import { isRecord, normalizeOutput } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { QuickNoteProse, QuickNoteSpeaker } from "./QuickNoteProse";
import { quickNoteDialogueField, quickNoteJsonText, quickNoteSummaryPanels, type QuickNoteSummaryPanel } from "./quick-note-content-presentation";

export function QuickNoteSummary({ summary }: { readonly summary: string }) {
  const panels = quickNoteSummaryPanels(summary);
  if (!panels.length) return null;
  return <div className="mt-7" data-quick-note-summary="true">
    {panels.map((panel) => <SummaryDisclosure key={panel.title} panel={panel} original={summary} />)}
  </div>;
}

function SummaryDisclosure({ panel, original }: { readonly panel: QuickNoteSummaryPanel; readonly original: string }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  return <details ref={detailsRef} className="border-t border-primary/10 pt-1" data-quick-note-summary-kind={panel.kind}>
    <summary ref={triggerRef} className="min-h-11 cursor-pointer py-3 text-sm text-muted-strong" aria-label={`${panel.title}（辅助摘要 · Step 1）`}>{panel.title}</summary>
    <div className="pb-4 pt-3 text-[13px] leading-6 text-muted-strong">
      {panel.kind === "dialogue" ? <DialogueValue value={panel.value} depth={0} original={original} /> : <SummaryValue value={panel.value} depth={0} original={original} />}
      {panel.kind === "dialogue" && <Button variant="ghost" className="mt-4 h-11 px-2 text-xs text-muted-strong" onClick={() => collapseQuickNoteDialogue(detailsRef.current, triggerRef.current)}>收起关键对话</Button>}
    </div>
  </details>;
}

export function collapseQuickNoteDialogue(details: Pick<HTMLDetailsElement, "open"> | null, trigger: Pick<HTMLElement, "focus" | "scrollIntoView"> | null) {
  if (!details) return;
  details.open = false;
  trigger?.focus({ preventScroll: true });
  trigger?.scrollIntoView({ block: "nearest", behavior: "instant" });
}

function SummaryValue({ value, depth, original }: { readonly value: unknown; readonly depth: number; readonly original: string }) {
  if (depth >= 8) return <p className="whitespace-pre-wrap break-words">{quickNoteJsonText(value, original)}</p>;
  if (Array.isArray(value) && value.length) return <ol className="space-y-5">{value.map((item, index) => <li key={index}><SummaryValue value={item} depth={depth + 1} original={original} /></li>)}</ol>;
  if (isRecord(value) && Object.keys(value).length) return <dl className="space-y-3">{Object.entries(value).map(([key, item]) => <div key={key}>
    <dt className="mb-1 text-xs font-medium text-muted-foreground">{key}</dt>
    <dd className="min-w-0"><SummaryValue value={item} depth={depth + 1} original={original} /></dd>
  </div>)}</dl>;
  return <p className="whitespace-pre-wrap break-words">{typeof value === "string" ? normalizeOutput(value) : quickNoteJsonText(value, original)}</p>;
}

function DialogueValue({ value, depth, original }: { readonly value: unknown; readonly depth: number; readonly original: string }) {
  if (depth >= 8) return <SummaryValue value={value} depth={depth} original={original} />;
  if (Array.isArray(value) && value.length) {
    const groups = value.some((item) => isRecord(item) && Object.entries(item).some(([key, entry]) => quickNoteDialogueField(key) === "time" && typeof entry === "string"));
    return <ol className={groups ? "divide-y divide-primary/10" : "space-y-2"}>{value.map((item, index) => <li key={index} className={groups ? "py-4 first:pt-0 last:pb-0" : undefined}><DialogueValue value={item} depth={depth + 1} original={original} /></li>)}</ol>;
  }
  if (isRecord(value) && Object.keys(value).length) {
    const entries = Object.entries(value);
    const fields: ReactNode[] = [];
    for (let index = 0; index < entries.length; index++) {
      const [key, item] = entries[index];
      const kind = quickNoteDialogueField(key);
      const next = entries[index + 1];
      // Combine only explicit adjacent speaker/text fields. Keep every other
      // field in its original position rather than guessing or reordering it.
      if (kind === "speaker" && typeof item === "string" && item.trim() && next && quickNoteDialogueField(next[0]) === "original" && typeof next[1] === "string") {
        fields.push(<div key={key}><dt className="sr-only">{key} / {next[0]}</dt><dd className="text-foreground"><QuickNoteSpeaker label={item} />{/[：:]\s*$/.test(item) ? " " : "："}<QuickNoteProse text={next[1]} /></dd></div>);
        index++;
        continue;
      }
      const styled = kind !== "unknown";
      fields.push(<div key={key} className={kind === "note" ? "border-l border-border pl-3 text-muted-strong" : undefined}>
        <dt className={styled ? "sr-only" : "mb-1 text-xs font-medium text-muted-foreground"}>{key}</dt>
        <dd className={kind === "time" && typeof item === "string" ? "whitespace-pre-wrap break-words text-xs text-muted-foreground" : "min-w-0"}>
          {kind === "time" && typeof item === "string" ? normalizeOutput(item)
            : kind === "speaker" && typeof item === "string" ? <QuickNoteSpeaker label={item} />
            : kind === "original" ? <div className="text-foreground"><DialogueValue value={item} depth={depth + 1} original={original} /></div>
            : <SummaryValue value={item} depth={depth + 1} original={original} />}
        </dd>
      </div>);
    }
    return <dl className="space-y-3">{fields}</dl>;
  }
  return typeof value === "string" ? <div className="text-foreground"><QuickNoteProse text={value} /></div> : <SummaryValue value={value} depth={depth} original={original} />;
}
