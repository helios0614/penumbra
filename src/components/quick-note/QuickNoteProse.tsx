import { Fragment } from "react";
import { Heart, Wind } from "lucide-react";
import { normalizeOutput } from "@/domain/quick-note";
import { quickNoteFragments, quickNoteLinePrefix, quickNoteSpeakerTone } from "./quick-note-content-presentation";

const PREFIX_COLORS = { ai: "quick-note-ai-prefix", user: "text-primary-ink" };

export function QuickNoteSpeaker({ label }: { readonly label: string }) {
  const tone = quickNoteSpeakerTone(label);
  return <strong className={`font-semibold ${PREFIX_COLORS[tone]}`} data-quick-note-prefix={tone}>{label}</strong>;
}

export function QuickNoteProse({ text }: { readonly text: string }) {
  const lines = normalizeOutput(text).split("\n");
  return <span className="whitespace-pre-wrap break-words">{lines.map((line, index) => {
    const prefix = quickNoteLinePrefix(line);
    return <Fragment key={index}>{prefix
      ? <>{prefix.leading}<strong className={`font-semibold ${PREFIX_COLORS[prefix.tone]}`} data-quick-note-prefix={prefix.tone}>{prefix.prefix}</strong>{prefix.body}</>
      : line}{index < lines.length - 1 ? "\n" : null}</Fragment>;
  })}</span>;
}

export function QuickNoteAnnotatedProse({ output }: { readonly output: string }) {
  return <>{quickNoteFragments(output).map((part, index) => {
    if (part.kind === "text") return <QuickNoteProse key={index} text={part.text} />;
    const heart = part.kind === "HEART";
    const Icon = heart ? Heart : Wind;
    return <aside key={index} className={`my-3 border-l-2 pl-4 ${heart ? "border-rose/35" : "border-lavender/35"}`} aria-label={`${part.kind} 片段`} data-quick-note-fragment={part.kind}>
      <div className={`mb-1 flex items-center gap-2 whitespace-normal text-[11px] font-medium ${heart ? "text-rose-foreground" : "text-lavender-foreground"}`}><Icon className="size-3.5" aria-hidden="true" />{part.kind}</div>
      <QuickNoteProse text={part.text} />
    </aside>;
  })}</>;
}
