import { memo, useRef } from "react";
import { Copy, Pencil, RefreshCw, TextCursorInput, Trash2 } from "lucide-react";
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
  onEdit?: () => void;
  editUnavailableReason?: string | null;
  className?: string;
  onInsert?: (text: string) => void;
  getSelectedText?: () => string | null;
  insertContent?: string;
  canUseCapturedSelection?: () => boolean;
}

function MessageActionsInner({
  role,
  content,
  onRegenerate,
  regenerateDisabled = false,
  onDelete,
  onEdit,
  editUnavailableReason,
  className,
  onInsert,
  getSelectedText,
  insertContent = content,
  canUseCapturedSelection,
}: MessageActionsProps) {
  const handleCopy = useCopyFeedback(content);
  const pointerSelection = useRef<{ content: string; text: string | null } | null>(null);

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

      {role !== "system" && onEdit && <Tooltip>
        <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-xs"
          aria-label="编辑消息" title={editUnavailableReason ?? "编辑消息"} disabled={!!editUnavailableReason}
          className="text-muted-foreground hover:text-foreground" onClick={onEdit} />}>
          <Pencil className="size-3" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{editUnavailableReason ?? "编辑"}</TooltipContent>
      </Tooltip>}

      {role === "assistant" && onInsert && insertContent.trim() && <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-xs"
          aria-label="放入输入框" title="放入输入框" className="text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => {
            const text = getSelectedText?.() ?? null;
            pointerSelection.current = { content, text };
            // Mouse focus would clear Selection. Leave touch selection entirely native.
            if (event.pointerType === "mouse" && event.button === 0 && text) event.preventDefault();
          }}
          onPointerCancel={() => { pointerSelection.current = null; }}
          onKeyDown={() => { pointerSelection.current = null; }}
          onClick={(event) => {
            const captured = pointerSelection.current;
            pointerSelection.current = null;
            const selected = getSelectedText?.() ?? (event.detail > 0 && captured?.content === content && canUseCapturedSelection?.() !== false ? captured.text : null);
            onInsert(selected ?? insertContent);
          }} />}>
          <TextCursorInput className="size-3" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>放入输入框</TooltipContent>
      </Tooltip>}

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
                aria-label="删除消息"
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
