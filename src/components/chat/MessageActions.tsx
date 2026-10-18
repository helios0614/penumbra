import { memo } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useCopyFeedback } from "./copy-feedback";

interface MessageActionsProps {
  role: "user" | "assistant" | "system";
  content: string;
  onRegenerate?: () => void;
  regenerateDisabled?: boolean;
  onDelete?: () => void;
  className?: string;
}

function MessageActionsInner({
  role,
  content,
  onRegenerate,
  regenerateDisabled = false,
  onDelete,
  className,
}: MessageActionsProps) {
  const handleCopy = useCopyFeedback(content);

  return (
    <div className={className}>
      {/* 复制 */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void handleCopy()}
              aria-label="复制消息"
              className="text-muted-foreground hover:text-foreground"
            />
          }
        >
          <Copy className="size-3" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>复制</TooltipContent>
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
                disabled={regenerateDisabled}
                aria-label="重新生成回复"
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
