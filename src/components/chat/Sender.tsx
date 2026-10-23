import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComposerToolsMenu } from "./ComposerToolsMenu";
import "./chat.css";

interface SenderProps {
  onSend?: (content: string) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  placeholder?: string;
  statusMessage?: string;
  className?: string;
  tools?: ReactNode;
  toolsLabel?: string;
  feedback?: ReactNode;
}

export function shouldSubmitSenderKey(input: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode?: number;
}): boolean {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing && input.keyCode !== 229;
}

export function clearAcceptedSenderDraft(
  currentDraft: string,
  submittedDraft: string,
): string {
  return currentDraft === submittedDraft ? "" : currentDraft;
}

export function Sender({
  onSend,
  disabled,
  placeholder = "输入消息…",
  statusMessage,
  className,
  tools,
  toolsLabel = "会话模型",
  feedback,
}: SenderProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusId = useId();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const composingRef = useRef(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const compactMeasureRef = useRef<HTMLDivElement>(null);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const [multiline, setMultiline] = useState(false);
  const [textHeight, setTextHeight] = useState(24);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<readonly string[]>([]);
  const draftRevisionRef = useRef(0);
  const expanded = focused || multiline;
  const displayedValue = pendingDraft === null ? value : "";

  // Measure inert text mirrors, never resize/reset the focused textarea to measure it.
  // Compact width is stable across expansion, so soft wrapping cannot toggle the layout back and forth.
  const autoResize = useCallback(() => {
    const compact = compactMeasureRef.current, content = contentMeasureRef.current;
    if (!compact || !content) return;
    setMultiline(compact.scrollHeight > 25);
    setTextHeight(Math.max(24, Math.min(content.scrollHeight, 144)));
  }, []);

  useLayoutEffect(() => {
    autoResize();
  }, [displayedValue, expanded, autoResize]);

  useEffect(() => {
    const compact = compactMeasureRef.current, content = contentMeasureRef.current;
    if (!compact || !content || typeof ResizeObserver === "undefined") return;
    let widths = `${compact.clientWidth}:${content.clientWidth}`;
    const observer = new ResizeObserver(() => {
      const next = `${compact.clientWidth}:${content.clientWidth}`;
      if (next === widths) return;
      widths = next;
      autoResize();
    });
    observer.observe(compact);
    observer.observe(content);
    return () => observer.disconnect();
  }, [autoResize]);

  const handleSubmit = useCallback(async () => {
    const submittedDraft = value;
    const submittedRevision = draftRevisionRef.current;
    const trimmed = submittedDraft.trim();
    if (!trimmed || disabled || !onSend || submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setPendingDraft(submittedDraft);
    const retainUnacceptedDraft = () => {
      if (draftRevisionRef.current !== submittedRevision) {
        setRecoveryDrafts((drafts) => [...drafts, submittedDraft]);
      }
    };
    try {
      const accepted = await onSend(trimmed);
      if (accepted !== false) {
        if (draftRevisionRef.current === submittedRevision) {
          setValue((current) => clearAcceptedSenderDraft(current, submittedDraft));
        }
      } else retainUnacceptedDraft();
    } catch {
      // The parent owns safe error presentation; retain the current draft.
      retainUnacceptedDraft();
    } finally {
      setPendingDraft(null);
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (shouldSubmitSenderKey({
        key: e.key,
        shiftKey: e.shiftKey,
        isComposing: e.nativeEvent.isComposing || composingRef.current,
        keyCode: e.nativeEvent.keyCode,
      })) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      draftRevisionRef.current += 1;
      setPendingDraft(null);
      setValue(e.target.value);
    },
    [],
  );

  const canSend =
    value.trim().length > 0 &&
    !disabled &&
    !isSubmitting &&
    onSend !== undefined;

  return (
    <div
      data-toast-obstacle
      className={cn(
        "chat-composer-dock",
        className,
      )}
    >
        {feedback}
        <div ref={composerRef} className="chat-composer mist-solid" data-expanded={expanded}
          style={{ "--chat-text-height": `${textHeight}px` } as CSSProperties}
          aria-busy={isSubmitting}
          onBlurCapture={(event) => {
            if (!menuOpen && !event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}>
          {tools && <ComposerToolsMenu open={menuOpen} anchor={composerRef} inputRef={textareaRef} label={toolsLabel} onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setFocused(typeof document !== "undefined" && document.activeElement === textareaRef.current);
          }}>
              {tools}
          </ComposerToolsMenu>}

          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            value={displayedValue}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            placeholder={pendingDraft === null ? placeholder : "正在提交，原文已暂存…"}
            aria-label="消息正文"
            disabled={disabled}
            aria-describedby={statusMessage ? statusId : undefined}
            rows={1}
            className={cn(
              "chat-composer-input scrollbar-none",
              "placeholder:text-muted-foreground",
              "resize-none outline-none focus:outline-none focus:ring-0",
              "caret-primary",
            )}
          />

          <Button
            variant="default"
            size="icon-lg"
            onClick={() => void handleSubmit()}
            disabled={!canSend}
            className={cn(
              "chat-composer-send size-11 shrink-0 rounded-full transition-opacity md:size-9",
              !canSend && "opacity-40",
            )}
            aria-label="发送消息"
            title="发送消息"
          >
            <Send className="size-4" />
          </Button>
          <div ref={compactMeasureRef} data-measure="compact" aria-hidden="true" className="chat-composer-measure">{displayedValue + "\u200b"}</div>
          <div ref={contentMeasureRef} data-measure="content" aria-hidden="true" className="chat-composer-measure">{displayedValue + "\u200b"}</div>
        </div>

        {recoveryDrafts.length > 0 && <details className="chat-composer-recovery mx-auto mt-2 max-w-[720px] text-xs text-muted-strong">
          <summary className="cursor-pointer">未确认的提交原文已保留（{recoveryDrafts.length}）</summary>
          <p className="mt-2">请先核对历史。恢复会追加到当前草稿，不会发送。</p>
          {recoveryDrafts.map((draft, index) => <div key={index} className="mt-2 space-y-2">
            <p className="scrollbar-none max-h-24 overflow-y-auto whitespace-pre-wrap break-words" tabIndex={0}>{draft}</p>
            <Button type="button" variant="outline" size="compact" disabled={disabled || isSubmitting} onClick={() => {
              if (disabled || submittingRef.current) return;
              draftRevisionRef.current += 1;
              setValue((current) => current ? `${current}\n\n${draft}` : draft);
              setRecoveryDrafts((drafts) => drafts.filter((_, i) => i !== index));
              textareaRef.current?.focus({ preventScroll: true });
            }}>恢复到草稿</Button>
          </div>)}
        </details>}

        {statusMessage && (
          <p
            id={statusId}
            className="chat-composer-status text-xs text-muted-foreground"
          >
            {statusMessage}
          </p>
        )}

    </div>
  );
}
