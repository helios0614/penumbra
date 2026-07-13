import { useEffect, useCallback, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConversationsList } from "./ConversationsList";
import { BubbleList } from "./BubbleList";
import { Sender } from "./Sender";
import { Welcome } from "./Welcome";
import { useConversations } from "./useConversations";
import { useChat } from "./useChat";

export function ChatView() {
  const conv = useConversations();
  const chat = useChat(conv.activeId);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 切换会话时加载消息
  useEffect(() => {
    chat.switchConversation(conv.activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.activeId]);

  // 新建会话
  const handleCreate = useCallback(async () => {
    await conv.create();
    setSheetOpen(false);
  }, [conv]);

  // 选择会话
  const handleSelect = useCallback(
    (id: string) => {
      conv.setActive(id);
      setSheetOpen(false);
    },
    [conv],
  );

  // 发送消息
  const handleSend = useCallback(
    (content: string) => {
      // 如果没有活跃会话，先创建一个
      if (!conv.activeId) {
        conv.create().then((newConv) => {
          if (newConv) {
            // 等状态更新后发送 — 用 setTimeout 确保 hook 状态已同步
            setTimeout(() => chat.sendMessage(content), 100);
          }
        });
        return;
      }
      chat.sendMessage(content);
    },
    [conv, chat],
  );

  const hasMessages = chat.messages.length > 0;
  const showWelcome = !hasMessages && !chat.isStreaming;

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* 侧栏 — 桌面端 */}
        <ConversationsList
          conversations={conv.conversations}
          activeId={conv.activeId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onRename={conv.rename}
          onDelete={conv.remove}
          className="hidden md:flex w-[280px] shrink-0"
        />

        {/* 主区域 — 毛玻璃覆盖，底层预留壁纸位 */}
        <div className="relative flex-1 flex flex-col min-w-0 w-0 overflow-hidden">
          {/* 壁纸层 — 替换 url() 即可换壁纸 */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "var(--chat-wallpaper, none)" }}
          />
          {/* 毛玻璃遮罩 */}
          <div className="mist-solid absolute inset-0 !border-0 !shadow-none" />
          {/* 内容层 */}
          <div className="relative flex-1 flex flex-col min-h-0">
          {/* 移动端顶栏 */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border md:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="会话列表" />
                }
              >
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <ConversationsList
                  conversations={conv.conversations}
                  activeId={conv.activeId}
                  onSelect={handleSelect}
                  onCreate={handleCreate}
                  onRename={conv.rename}
                  onDelete={conv.remove}
                  className="w-full h-full border-r-0"
                />
              </SheetContent>
            </Sheet>

            <span className="text-sm font-medium text-foreground truncate">
              {conv.activeConversation?.title ?? "Penumbra"}
            </span>
          </div>

          {/* 消息区 or 欢迎页 */}
          {showWelcome ? (
            <Welcome onSendPrompt={handleSend} />
          ) : (
            <BubbleList
              messages={chat.messages}
              streamingId={chat.streamingId}
              streamingContent={chat.streamingContent}
              onRegenerate={chat.regenerate}
              onDelete={chat.removeMessage}
            />
          )}

          {/* 输入区 */}
          <Sender
            onSend={handleSend}
            onStop={chat.stopStreaming}
            isStreaming={chat.isStreaming}
          />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
