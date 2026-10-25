import { ChevronDown, ChevronUp, LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MessageSearchResult } from "@/domain/message";
import type { useChatSearch } from "./useChatSearch";
import { highlightSearchText } from "./search-highlight";

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
  return (
    <section
      className="chat-search-panel shrink-0 border-b border-border px-3 py-2 sm:px-4"
      aria-label="搜索当前会话"
    >
      <div className="flex min-w-0 items-center gap-1">
        <Search
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          autoFocus
          aria-label="搜索当前会话"
          placeholder="搜索当前会话的历史…"
          maxLength={200}
          value={search.query}
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base outline-none sm:text-sm"
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
            aria-label="清空搜索"
            onClick={() => search.setQuery("")}
          >
            <X className="size-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="上一条匹配消息"
          disabled={pending || index <= 0}
          onClick={() => {
            const item = state.items[index - 1];
            if (item) onJump(item);
          }}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="下一条匹配消息"
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
          <ChevronDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="关闭搜索"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div
        className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {busy && (
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
        )}
        <span>
          {busy
            ? state.status === "scanning"
              ? "仍在搜索历史…"
              : "正在搜索…"
            : !search.query.trim()
              ? "输入关键词搜索完整公开历史"
              : state.status === "complete" && !state.items.length
                ? "没有匹配消息"
                : state.items.length
                  ? `已找到 ${state.items.length} 条${state.next ? "，可继续查找" : ""}`
                  : state.paused
                    ? "搜索已暂停"
                    : ""}
        </span>
        {busy && (
          <button
            className="underline underline-offset-2"
            onClick={search.stop}
          >
            停止搜索
          </button>
        )}
        <button className="ml-auto min-h-8" onClick={onReturn}>
          返回搜索前位置
        </button>
        <button className="min-h-8" onClick={onLatest}>
          回到最新
        </button>
      </div>
      {(state.error || error) && (
        <p role="alert" className="py-1 text-xs text-destructive-foreground">
          {error ?? state.error}
          <button
            className="ml-2 underline"
            onClick={() => void search.retry()}
          >
            重试搜索
          </button>
        </p>
      )}
      <div
        className="chat-search-results overflow-y-auto overscroll-contain"
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
            className="chat-search-result block w-full rounded-lg px-2 py-2 text-left disabled:opacity-60"
            disabled={pending}
            onClick={(event) => {
              (
                event.currentTarget.ownerDocument
                  .activeElement as HTMLElement | null
              )?.blur();
              onJump(item);
            }}
          >
            <span className="mb-0.5 block text-[11px] text-muted-foreground">
              {item.role === "user"
                ? "用户"
                : item.role === "assistant"
                  ? "知远"
                  : "系统"}{" "}
              ·{" "}
              {new Date(item.createdAt * 1000).toLocaleString("zh-CN", {
                hour12: false,
              })}
            </span>
            {item.snippets.slice(0, 2).map((s, i) => (
              <span
                key={i}
                className="block break-words text-sm leading-6 [overflow-wrap:anywhere]"
              >
                {highlightSearchText(s.text, search.query)}
              </span>
            ))}
          </button>
        ))}
      </div>
      {state.next && !busy && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full"
          onClick={() => void search.loadMore()}
        >
          继续搜索历史
        </Button>
      )}
      {state.paused && !state.next && (
        <Button variant="ghost" size="sm" onClick={() => void search.retry()}>
          重新搜索
        </Button>
      )}
    </section>
  );
}
