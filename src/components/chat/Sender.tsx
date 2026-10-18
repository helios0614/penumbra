import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SenderProps {
  onSend?: (content: string) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  placeholder?: string;
  statusMessage?: string;
  className?: string;
}

export function shouldSubmitSenderKey(input: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}): boolean {
  return input.key === "Enter" && !input.shiftKey && !input.isComposing;
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
}: SenderProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusId = useId();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 自动增高
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 6 * 24; // 约 6 行（line-height 24px）
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

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
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
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
        isComposing: e.nativeEvent.isComposing,
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
        "shrink-0 overflow-hidden border-x-0 border-b-0 border-t border-border bg-background/10 p-4 shadow-none backdrop-blur-xl",
        className,
      )}
    >
      <div className="max-w-[720px] mx-auto">
        <div className="mist-solid flex items-center gap-2 rounded-lg px-3 py-2">
          {/* 附件按钮 */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            disabled
            aria-label="附件上传尚未接入"
          >
            <Paperclip className="size-4" />
          </Button>

          {/* 输入框 */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            aria-describedby={statusMessage ? statusId : undefined}
            rows={1}
            className={cn(
              "scrollbar-none",
              "flex-1 min-w-0 bg-transparent text-[15px] leading-6 text-foreground",
              "placeholder:text-muted-foreground",
              "resize-none outline-none focus:outline-none focus:ring-0",
              "caret-primary",
              "max-h-[144px]", // 6 行
            )}
          />

          <Button
            variant="default"
            size="icon-sm"
            onClick={() => void handleSubmit()}
            disabled={!canSend}
            className={cn(
              "shrink-0 rounded-full transition-opacity",
              !canSend && "opacity-40",
            )}
            aria-label="发送消息"
          >
            <Send className="size-4" />
          </Button>
        </div>

        {statusMessage && (
          <p
            id={statusId}
            className="mt-2 text-center text-xs text-muted-foreground"
          >
            {statusMessage}
          </p>
        )}

      </div>
    </div>
  );
}
