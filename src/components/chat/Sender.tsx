import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  type ReactNode,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Send, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import "./chat.css";

interface SenderProps {
  onSend?: (content: string) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  placeholder?: string;
  statusMessage?: string;
  className?: string;
  tools?: ReactNode;
  toolsLabel?: string;
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
}: SenderProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusId = useId();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const composingRef = useRef(false);

  // 自动增高
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 6 * 24; // 约 6 行（line-height 24px）
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useLayoutEffect(() => {
    autoResize();
  }, [value, autoResize]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    // Wrapping changes on rotation and when the mobile toolbar expands.
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      autoResize();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [autoResize]);

  const handleSubmit = useCallback(async () => {
    const submittedDraft = value;
    const trimmed = submittedDraft.trim();
    if (!trimmed || disabled || !onSend || submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const accepted = await onSend(trimmed);
      if (accepted !== false) {
        setValue((current) => clearAcceptedSenderDraft(
          current,
          submittedDraft,
        ));
      }
    } catch {
      // The parent owns safe error presentation; retain the current draft.
    } finally {
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
        <div className="chat-composer mist-solid" data-expanded={focused || menuOpen}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}>
          {tools && <Popover open={menuOpen} onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setFocused(typeof document !== "undefined" && document.activeElement === textareaRef.current);
          }}>
            <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-lg"
              className="chat-composer-tools size-11 rounded-full text-muted-foreground md:size-9" aria-label="会话模型与选项" title={toolsLabel} />}>
              <Plus className="size-5" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={12}
              initialFocus={(type) => type === "keyboard"} finalFocus={(type) => type === "keyboard"}
              className="chat-composer-menu" aria-label="会话模型与选项">
              <PopoverTitle className="sr-only">会话模型与选项</PopoverTitle>
              {tools}
            </PopoverContent>
          </Popover>}

          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            placeholder={placeholder}
            aria-label="消息正文"
            disabled={disabled}
            aria-describedby={statusMessage ? statusId : undefined}
            rows={1}
            className={cn(
              "chat-composer-input",
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
        </div>

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
