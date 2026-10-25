import { Fragment } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTROL_FOCUS } from "@/components/ui/control-styles";
import type { MessageSearchResult } from "@/domain/message";
import type { useChatSearch } from "./useChatSearch";
import { highlightSearchText } from "./search-highlight";
import { useSearchResultScroll } from "./useSearchResultScroll";

export function ChatSearchPanel({
  search,
  onJump,
  onClose,
  onReturn,
  onLatest,
  pending,
  error,
}: {
  search: ReturnType<typeof useChatSearch>;
  onJump: (result: MessageSearchResult) => void;
  onClose: () => void;
  onReturn: () => void;
  onLatest: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const { state } = search,
    index = state.items.findIndex((m) => m.messageId === state.selected);
  const busy = state.status === "loading" || state.status === "scanning";
  const resultListRef = useSearchResultScroll(search.open, state.selected);
  return (
    <section
      className="mist-glass-strong chat-search-panel flex min-h-0 flex-col overflow-hidden rounded-[24px]"
      aria-label="搜索当前会话"
    >
      <div className="chat-search-toolbar flex min-w-0 shrink-0 items-center gap-2 px-3 py-2.5">
        <div className="relative min-w-0 flex-1">
          <Input
            surface="translucent"
            autoFocus
            aria-label="搜索当前会话"
            placeholder="搜索当前会话的历史…"
            maxLength={200}
            value={search.query}
            className="pr-10 text-foreground shadow-none"
            onChange={(event) => search.setQuery(event.target.value)}
            onCompositionStart={() => search.setComposing(true)}
            onCompositionEnd={() => search.setComposing(false)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const next = state.items[index + 1] ?? state.items[0];
                if (next) onJump(next);
                else if (state.next) void search.loadMore();
              }
            }}
          />
          {search.query && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute inset-y-0 right-1 my-auto text-muted-foreground/80 focus-visible:text-foreground"
              aria-label="清空搜索"
              title="清空搜索"
              onClick={() => search.setQuery("")}
            >
              <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-strong"
          aria-label="关闭搜索"
          title="关闭搜索"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {search.query.trim() && (
        <div className="chat-search-meta flex min-w-0 shrink-0 items-center justify-between gap-2 px-4 pb-1 text-xs leading-5">
          <div
            className="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {busy && (
              <LoaderCircle
                className="size-3 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            <span className="truncate">
              {busy ? (
                state.status === "scanning" ? (
                  "扫描中…"
                ) : (
                  "正在搜索…"
                )
              ) : state.status === "complete" && !state.items.length ? (
                "没有匹配消息"
              ) : state.items.length ? (
                <>
                  <span className="text-primary">{state.items.length}</span>{" "}
                  条结果
                </>
              ) : state.paused ? (
                "搜索已暂停"
              ) : (
                ""
              )}
            </span>
            {busy && (
              <Button
                variant="ghost"
                size="xs"
                className="text-xs text-muted-strong"
                aria-label="停止搜索"
                onClick={search.stop}
              >
                停止
              </Button>
            )}
          </div>
          {state.items.length > 0 && (
            <div
              className="flex shrink-0 items-center gap-1"
              role="group"
              aria-label="搜索结果导航"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-strong"
                aria-label="上一条匹配消息"
                title="上一条匹配消息"
                disabled={pending || index <= 0}
                onClick={() => {
                  const item = state.items[index - 1];
                  if (item) onJump(item);
                }}
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-strong"
                aria-label="下一条匹配消息"
                title="下一条匹配消息"
                disabled={
                  pending ||
                  !state.items.length ||
                  (index >= state.items.length - 1 && !state.next)
                }
                onClick={() => {
                  const item =
                    state.items[index + 1] ??
                    (index < 0 ? state.items[0] : undefined);
                  if (item) onJump(item);
                  else
                    void search.loadMore().then((page) => {
                      if (page?.items[0]) onJump(page.items[0]);
                    });
                }}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
      {(state.error || error) && (
        <p
          role="alert"
          className="shrink-0 px-4 pb-2 text-xs leading-5 text-destructive-foreground"
        >
          {error ?? state.error}
          <Button
            variant="ghost"
            size="xs"
            className="ml-1 text-xs"
            onClick={() => void search.retry()}
          >
            重试搜索
          </Button>
        </p>
      )}
      <div className="chat-search-paper flex min-h-0 flex-col">
        <div
          ref={resultListRef}
          className="chat-search-results scrollbar-none min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain"
          role="list"
          aria-label="历史搜索结果"
        >
          {state.items.map((item) => (
            <button
              type="button"
              role="listitem"
              key={item.messageId}
              aria-current={
                state.selected === item.messageId ? "true" : undefined
              }
              className={`chat-search-result block w-full min-w-0 px-4 py-3 text-left text-foreground transition-colors motion-reduce:transition-none disabled:opacity-60 ${CONTROL_FOCUS}`}
              disabled={pending}
              onClick={(event) => {
                (
                  event.currentTarget.ownerDocument
                    .activeElement as HTMLElement | null
                )?.blur();
                onJump(item);
              }}
            >
              <span className="mb-1 block break-words text-xs leading-4 text-muted-foreground">
                <span
                  className={item.role === "assistant" ? "text-ai" : undefined}
                >
                  {item.role === "user"
                    ? "用户"
                    : item.role === "assistant"
                      ? "知远"
                      : "系统"}
                </span>{" "}
                ·{" "}
                {new Date(item.createdAt * 1000).toLocaleString("zh-CN", {
                  hour12: false,
                })}
              </span>
              <span className="line-clamp-2 break-words text-sm leading-5 text-[color-mix(in_srgb,var(--color-foreground)_70%,var(--color-muted-strong))] [overflow-wrap:anywhere] sm:line-clamp-3">
                {item.snippets.slice(0, 2).map((s, i) => (
                  <Fragment key={i}>
                    {i > 0 && " · "}
                    {highlightSearchText(s.text, search.query)}
                  </Fragment>
                ))}
              </span>
            </button>
          ))}
        </div>
        {search.query.trim() && (
          <div className="chat-search-footer flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border px-3 py-1.5">
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="历史阅读位置"
            >
              <Button
                variant="ghost"
                size="xs"
                className="text-xs text-muted-strong"
                aria-label="返回搜索前位置"
                title="返回搜索前位置"
                onClick={onReturn}
              >
                返回原位
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs text-muted-strong"
                onClick={onLatest}
              >
                回到最新
              </Button>
            </div>
            {state.next && !busy && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs text-muted-strong"
                onClick={() => void search.loadMore()}
              >
                继续搜索历史
              </Button>
            )}
            {state.paused && !state.next && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs text-muted-strong"
                onClick={() => void search.retry()}
              >
                重新搜索
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
