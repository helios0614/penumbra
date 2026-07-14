import { useState, useCallback } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Conversation } from "./types";

interface ConversationsListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

export function ConversationsList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  className,
}: ConversationsListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // 打开重命名弹窗
  const openRename = useCallback((conv: Conversation) => {
    setRenameTarget(conv);
    setRenameValue(conv.title);
    setMenuOpenId(null);
  }, []);

  // 确认重命名
  const confirmRename = useCallback(() => {
    if (renameTarget && renameValue.trim()) {
      onRename(renameTarget.id, renameValue.trim());
    }
    setRenameTarget(null);
  }, [renameTarget, renameValue, onRename]);

  // 确认删除
  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      onDelete(deleteTarget.id);
    }
    setDeleteTarget(null);
  }, [deleteTarget, onDelete]);

  return (
    <>
      <div
        className={cn(
          "mist-solid flex flex-col border-r border-border h-full overflow-hidden shadow-none",
          className,
        )}
      >
        {/* 头部 */}
        <div className="shrink-0 flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">会话</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onCreate}
            aria-label="新建会话"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* 列表 */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-0.5 p-2">
            {conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageCircle className="size-8 mb-2 opacity-40" />
                <p className="text-xs">暂无会话</p>
              </div>
            )}

            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const timeAgo = formatDistanceToNow(
                new Date(conv.updated_at * 1000),
                { locale: zhCN, addSuffix: true },
              );

              return (
                <div
                  key={conv.id}
                  className={cn(
                    "relative flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer",
                    "transition-colors duration-150 group",
                    isActive
                      ? "bg-surface-secondary"
                      : "hover:bg-surface-secondary/50",
                  )}
                  onClick={() => onSelect(conv.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(conv.id);
                    }
                  }}
                >
                  {/* 激活指示条 */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm font-medium truncate",
                          isActive
                            ? "text-foreground"
                            : "text-foreground/80",
                        )}
                      >
                        {conv.title}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                        {conv.message_count} 条消息
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground/70">
                        {timeAgo}
                      </span>
                    </div>
                  </div>

                  {/* 更多操作 — hover 显示 */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className={cn(
                      "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                      menuOpenId === conv.id && "opacity-100",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                    }}
                    aria-label="更多操作"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>

                  {/* 浮动菜单 */}
                  {menuOpenId === conv.id && (
                    <div
                      className={cn(
                        "absolute right-2 top-full z-20 mt-1",
                        "mist-glass-strong rounded-lg p-1 min-w-[120px]",
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-foreground hover:bg-surface-secondary rounded-md transition-colors"
                        onClick={() => openRename(conv)}
                      >
                        <Pencil className="size-3.5" />
                        重命名
                      </button>
                      <button
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        onClick={() => {
                          setDeleteTarget(conv);
                          setMenuOpenId(null);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.title}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重命名弹窗 */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename();
            }}
            placeholder="输入新名称"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmRename} disabled={!renameValue.trim()}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
