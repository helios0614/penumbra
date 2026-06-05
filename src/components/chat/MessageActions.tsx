import { memo, useState, useCallback } from "react";
import { Copy, RefreshCw, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageActionsProps {
  role: "user" | "assistant" | "system";
  content: string;
  onRegenerate?: () => void;
  onDelete?: () => void;
  className?: string;
}

function MessageActionsInner({
  role,
  content,
  onRegenerate,
  onDelete,
  className,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div className={className}>
      {/* 复制 */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          {copied ? (
            <Check className="size-3 text-success" />
          ) : (
            <Copy className="size-3" />
          )}
        </TooltipTrigger>
        <TooltipContent>{copied ? "已复制" : "复制"}</TooltipContent>
      </Tooltip>

      {/* 重新生成 — 仅 assistant 消息 */}
      {role === "assistant" && onRegenerate && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onRegenerate}
                className="text-muted-foreground hover:text-foreground"
              />
            }
          >
            <RefreshCw className="size-3" />
          </TooltipTrigger>
          <TooltipContent>重新生成</TooltipContent>
        </Tooltip>
      )}

      {/* 删除 */}
      {onDelete && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive"
              />
            }
          >
            <Trash2 className="size-3" />
          </TooltipTrigger>
          <TooltipContent>删除</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export const MessageActions = memo(MessageActionsInner);
