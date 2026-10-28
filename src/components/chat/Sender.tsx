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
  type RefObject,
} from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComposerToolsMenu } from "./ComposerToolsMenu";
import "./chat.css";
import { appendComposerText, type SenderDraft, type SenderHandle } from "./composer-draft";
import { useSendShortcut, type SendShortcut } from "./send-shortcut-preference";

interface SenderProps {
  // "retained" means the parent owns the unconfirmed submission, separately from the next draft.
  onSend?: (content: string) => boolean | void | "retained" | Promise<boolean | void | "retained">;
  disabled?: boolean;
  submitDisabled?: boolean;
  placeholder?: string;
  statusMessage?: string;
  className?: string;
  tools?: ReactNode;
  toolsLabel?: string;
  feedback?: ReactNode;
  initialDraft?: SenderDraft;
  onDraftChange?: (draft: SenderDraft) => void;
  apiRef?: RefObject<SenderHandle | null>;
  attachments?: ReactNode;
  hasAttachments?: boolean;
  attachmentsReady?: boolean;
  onFiles?: (files: readonly File[]) => void;
}

export function shouldSubmitSenderKey(input: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode?: number;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly repeat?: boolean;
  readonly mobile?: boolean;
  readonly shortcut?: SendShortcut;
}): boolean {
  return input.key === "Enter" && !input.isComposing && input.keyCode !== 229 &&
    !input.ctrlKey && !input.metaKey && !input.altKey && !input.repeat && !input.mobile &&
    (input.shortcut === "enter" && !input.shiftKey || input.shortcut === "shift-enter" && input.shiftKey);
}

/** Conservatively keep Enter native on touch/mobile devices, including iPad desktop UA. */
export function isMobileSenderKeyboard(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 ||
    navigator.maxTouchPoints > 0 && typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
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
  submitDisabled = false,
  placeholder = "输入消息…",
  statusMessage,
  className,
  tools,
  toolsLabel = "会话模型",
  feedback,
  initialDraft,
  onDraftChange,
  apiRef,
  attachments,
  hasAttachments = false,
  attachmentsReady = true,
  onFiles,
}: SenderProps) {
  const sendShortcut = useSendShortcut();
  const [value, setValue] = useState(initialDraft?.value ?? "");
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
  const [recoveryDrafts, setRecoveryDrafts] = useState<readonly string[]>(initialDraft?.recoveryDrafts ?? []);
  const draftRevisionRef = useRef(0);
  const cursorToEnd = useRef(false);
  const queuedAppend = useRef<string[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const expanded = focused || multiline;
  const displayedValue = value;

  useLayoutEffect(() => {
    onDraftChange?.({ value, recoveryDrafts });
    if (cursorToEnd.current && textareaRef.current) {
      cursorToEnd.current = false;
      textareaRef.current.setSelectionRange(value.length, value.length);
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [value, recoveryDrafts, onDraftChange]);

  const append = useCallback((text: string) => {
    if (!text.trim() || disabled) return false;
    if (composingRef.current) { queuedAppend.current.push(text); return true; }
    draftRevisionRef.current += 1;
    const next = appendComposerText(valueRef.current, text);
    valueRef.current = next;
    setValue(next);
    // Focus in the user's click gesture so touch browsers can open the keyboard.
    setFocused(true);
    textareaRef.current?.focus({ preventScroll: true });
    cursorToEnd.current = true;
    return true;
  }, [disabled]);
  useLayoutEffect(() => {
    if (!apiRef) return;
    const handle = { append };
    apiRef.current = handle;
    return () => { if (apiRef.current === handle) apiRef.current = null; };
  }, [apiRef, append]);

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
    const submittedDraft = valueRef.current;
    const submittedRevision = draftRevisionRef.current;
    const trimmed = submittedDraft.trim();
    if ((!trimmed && !hasAttachments) || !attachmentsReady || disabled || submitDisabled || !onSend || submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    valueRef.current = "";
    setValue("");
    const retainUnacceptedDraft = () => {
      if (draftRevisionRef.current === submittedRevision) {
        valueRef.current = submittedDraft;
        setValue(submittedDraft);
      } else if (submittedDraft.trim()) {
        setRecoveryDrafts((drafts) => [...drafts, submittedDraft]);
      }
    };
    try {
      const accepted = await onSend(submittedDraft);
      if (accepted === false) retainUnacceptedDraft();
    } catch {
      // The parent owns safe error presentation; retain the current draft.
      retainUnacceptedDraft();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [disabled, submitDisabled, onSend, hasAttachments, attachmentsReady]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (shouldSubmitSenderKey({
        key: e.key,
        shiftKey: e.shiftKey,
        isComposing: e.nativeEvent.isComposing || composingRef.current,
        keyCode: e.nativeEvent.keyCode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        repeat: e.repeat,
        mobile: isMobileSenderKeyboard(),
        shortcut: sendShortcut,
      })) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit, sendShortcut],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      draftRevisionRef.current += 1;
      valueRef.current = e.target.value;
      setValue(e.target.value);
    },
    [],
  );

  const canSend =
    (value.trim().length > 0 || hasAttachments) && attachmentsReady &&
    !disabled &&
    !submitDisabled &&
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
        {attachments}
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
            onPaste={event => {
              if (disabled || !onFiles) return;
              const files = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/"))
                .map(item => item.getAsFile()).filter((file): file is File => file !== null);
              if (files.length) { event.preventDefault(); onFiles(files); }
            }}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              const queued = queuedAppend.current.splice(0);
              if (queued.length && event.currentTarget) valueRef.current = event.currentTarget.value;
              queued.forEach(append);
            }}
            placeholder={placeholder}
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
