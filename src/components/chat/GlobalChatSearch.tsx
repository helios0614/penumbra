import { useEffect, useRef, useState } from "react";
import { useAiName } from "@/components/identity/AiNameContext";
import { BookOpen, Search, Square } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatConversationItemViewModel } from "@/components/chat-workspace/presentation";
import { globalResultKey, type GlobalMessageSearchResult } from "@/domain/message/global-message-search";
import { useGlobalChatSearch } from "./useGlobalChatSearch";
import { GlobalSearchSummary } from "./GlobalSearchSummary";
import { highlightSearchText } from "./search-highlight";
import { ConversationContextDialog } from "./ConversationContextDialog";
import { contextTime, readPublicConversationTitle, type ConversationContextAnchor } from "./conversation-context";
import { useReadonlyDialogFrame } from "./useReadonlyDialogFrame";
import "./global-search.css";

export function GlobalChatSearch({ conversations }: { conversations: readonly ChatConversationItemViewModel[] }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const contentRef = useReadonlyDialogFrame(open, () => setOpen(false), "globalChatSearch");
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant="ghost" className="mx-2 my-1.5 min-h-11 shrink-0 justify-start gap-2 rounded-xl text-muted-strong" />}>
      <Search className="size-4" aria-hidden="true" />搜索全部聊天
    </DialogTrigger>
    <DialogContent ref={contentRef} initialFocus={input} className="mist-paper global-chat-search max-w-2xl">
      <DialogHeader>
        <DialogTitle>搜索全部聊天</DialogTitle>
        <DialogDescription>从最近 30 天开始，按需继续查找更早的公开记录。</DialogDescription>
      </DialogHeader>
      {open && <GlobalSearchContent conversations={conversations} inputRef={input} />}
    </DialogContent>
  </Dialog>;
}

function GlobalSearchContent({ conversations, inputRef }: {
  conversations: readonly ChatConversationItemViewModel[];
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const aiName = useAiName();
  const search = useGlobalChatSearch();
  const { state } = search;
  const [anchor, setAnchor] = useState<ConversationContextAnchor | null>(null);
  // Only apply observed list changes; an old list snapshot must not override a
  // fresh server title. Deleted known owners are removed without guessing IDs.
  const originalTitles = useRef(new Map(conversations.map(c => [c.id, c.title])));
  const titles = new Map(conversations.map(c => [c.id, c.title]));
  const [publicTitles, setPublicTitles] = useState<Record<string, { version: string; title: string }>>({});
  const changed = JSON.stringify(conversations.filter(c => originalTitles.current.get(c.id) !== c.title &&
    state.items.some(item => item.conversationId === c.id)).map(c => [c.id, c.title]));
  useEffect(() => {
    const controller = new AbortController();
    const owners = JSON.parse(changed) as [string, string][];
    for (const [id, version] of owners) {
      void readPublicConversationTitle(id, { signal: controller.signal }).then(title => {
        if (!controller.signal.aborted) setPublicTitles(s => ({ ...s, [id]: { version, title } }));
      }).catch(() => {});
    }
    return () => controller.abort();
  }, [changed]);
  const deleted = (id: string) => originalTitles.current.has(id) && !titles.has(id);
  const title = (id: string, fallback: string) => titles.has(id) && titles.get(id) !== originalTitles.current.get(id)
    ? publicTitles[id]?.version === titles.get(id) ? publicTitles[id]!.title : "会话名称已更新" : fallback;
  const items = state.items.filter(item => !deleted(item.conversationId));
  const openSource = (item: GlobalMessageSearchResult) => {
    inputRef.current?.blur();
    setAnchor({ conversationId: item.conversationId, messageId: item.messageId,
      conversationTitle: title(item.conversationId, item.conversationTitle) });
  };
  const busy = state.status === "loading";
  const action = state.status === "error" ? "重试本次查找" : state.status === "paused" ? "继续已停止的查找"
    : state.status === "complete" ? "继续查找更早 30 天" : "继续查找当前时间段";
  return <>
    <div data-global-search-controls className="shrink-0 space-y-2 border-b border-border/60 px-5 py-3 sm:px-6">
      <label className="sr-only" htmlFor="global-chat-query">全部聊天关键词</label>
      <Input ref={inputRef} id="global-chat-query" value={search.query} maxLength={200}
        surface="translucent" controlSize="comfortable" className="rounded-xl text-base md:text-base" placeholder="查找过去聊过的内容…"
        onChange={e => search.setQuery(e.target.value)} onCompositionStart={() => search.setComposing(true)} onCompositionEnd={() => search.setComposing(false)}
        onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !search.composing && !busy) { e.preventDefault(); void search.proceed(); } }} />
      <GlobalSearchSummary range={state.range} count={items.length} status={state.status} />
    </div>
    <DialogBody className="global-chat-results p-0 sm:px-0" data-has-results={items.length > 0} aria-busy={busy}>
      {items.length > 0 && <ol className="divide-y divide-border/60">
        {items.map(item => <li key={globalResultKey(item)} className="min-w-0 px-5 py-4 sm:px-6">
          <p className="truncate text-sm font-medium text-muted-strong" title={title(item.conversationId, item.conversationTitle)}>{title(item.conversationId, item.conversationTitle)}</p>
          <div data-global-result-meta className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs leading-5 text-muted-foreground">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
              <span className="shrink-0">{item.role === "user" ? "你" : item.role === "assistant" ? aiName : "系统通知"}</span>
              <time className="min-w-0 [overflow-wrap:anywhere]">{contextTime(item.createdAt)}</time>
            </div>
            <Button type="button" variant="ghost" className="min-h-11 shrink-0 gap-1 whitespace-nowrap rounded-md px-1 text-xs text-primary-ink hover:bg-primary/8 hover:text-primary-ink active:bg-primary/12" onClick={() => openSource(item)}>
              <BookOpen className="size-3" aria-hidden="true" />查看原文
            </Button>
          </div>
          <div className="mt-1 space-y-1 text-sm leading-7 text-foreground [overflow-wrap:anywhere]">
            {item.snippets.map((snippet, index) => <p key={`${snippet.segmentKey}:${index}`}>{highlightSearchText(snippet.text, search.query)}</p>)}
          </div>
        </li>)}
      </ol>}
      {!items.length && !busy && <p role="status" className="px-5 py-8 text-sm leading-7 text-muted-foreground sm:px-6">
        {state.status === "complete" ? "已搜索的时间段内没有匹配消息。更早的记录尚未搜索。"
          : state.status === "scan_pending" ? "本批未找到匹配消息，可以继续查找当前时间段。"
          : state.status === "paused" ? "查找已停止，当前时间段尚未查完。"
          : state.status === "error" ? "本批查找暂未完成，请重试。" : "输入关键词，寻找一段过去的对话。"}
      </p>}
    </DialogBody>
    {search.query.trim() && <div data-global-search-actions className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 px-5 py-3 sm:px-6">
      {state.status === "error" && <p role="alert" className="w-full text-xs leading-5 text-muted-strong">本次查找未完成，已有结果已保留。若续查已失效，请重新从最近 30 天查找。</p>}
      {busy ? <Button variant="ghost" className="min-h-11" onClick={search.stop}><Square className="size-3" aria-hidden="true" />停止查找</Button>
        : <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" disabled={search.composing || state.status === "idle"} onClick={() => void search.proceed()}>{action}</Button>}
      {state.status === "error" && <Button variant="ghost" className="min-h-11" onClick={search.restart}>重新从最近 30 天查找</Button>}
    </div>}
    <ConversationContextDialog anchor={anchor && { ...anchor, conversationTitle: title(anchor.conversationId, anchor.conversationTitle) }}
      unavailable={!!anchor && deleted(anchor.conversationId)} onClose={() => setAnchor(null)} />
  </>;
}
