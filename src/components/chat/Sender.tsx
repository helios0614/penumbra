import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Send, Square, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SenderProps {
  onSend?: (content: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  statusMessage?: string;
  className?: string;
}

export function Sender({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = "输入消息…",
  statusMessage,
  className,
}: SenderProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusId = useId();

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

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || !onSend) return;
    onSend(trimmed);
    setValue("");
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) return;
        handleSubmit();
      }
    },
    [handleSubmit, isStreaming],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
    },
    [],
  );

  const canSend = value.trim().length > 0 && !disabled && onSend !== undefined;

  return (
    <div
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
            disabled={disabled}
            aria-label="添加附件"
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
              "flex-1 min-w-0 bg-transparent text-[15px] leading-6 text-foreground",
              "placeholder:text-muted-foreground",
              "resize-none outline-none focus:outline-none focus:ring-0",
              "caret-primary",
              "max-h-[144px]", // 6 行
            )}
          />

          {/* 发送 / 停止按钮 */}
          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={onStop}
              disabled={disabled || !onStop}
              className="shrink-0 rounded-full"
              aria-label="停止生成"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon-sm"
              onClick={handleSubmit}
              disabled={!canSend}
              className={cn(
                "shrink-0 rounded-full transition-opacity",
                !canSend && "opacity-40",
              )}
              aria-label="发送消息"
            >
              <Send className="size-4" />
            </Button>
          )}
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
