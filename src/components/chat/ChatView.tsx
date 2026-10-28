import { ArrowLeft, LoaderCircle, Menu, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getChatSenderAvailability,
  getChatRegenerateAvailability,
  useChatRealtime,
  useChatSend,
  type ChatWorkspaceControllerState,
} from "@/components/chat-workspace";
import type { ChatRealtimeState } from "@/application/chat-realtime";
import {
  INITIAL_CHAT_SEND_STATE,
  isChatExecutionActive,
  type ChatSendState,
} from "@/application/chat-send";
import {
  composeVisibleChatMessages,
  presentChatConversations,
} from "@/components/chat-workspace/presentation";
import { useChatWorkspace } from "@/components/chat-workspace/useChatWorkspace";
import { pendingChatConversationId } from "@/components/chat-workspace/useChatSend";
import { useChatUserName } from "@/components/chat-workspace/useChatUserName";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";

import { BubbleList, type ChatReadingHandle, type ChatJump, type ReadingBookmark } from "./BubbleList";
import { useChatSearch } from "./useChatSearch";
import { ChatSearchPanel } from "./ChatSearchPanel";
import { ChatSearchReveal } from "./ChatSearchReveal";
import type { MessageSearchResult } from "@/domain/message";
import { useSearchBack, hasOpenChatDialog } from "./search-history";
import { normalizeSearch, searchTextRanges } from "./search-highlight";
import { ChatShell } from "./ChatShell";
import { ChatExecutionFeedback } from "./ChatExecutionFeedback";
import {
  ChatWorkspaceEmpty,
  ChatWorkspaceError,
  ChatWorkspaceLoading,
} from "./ChatWorkspaceStates";
import { ConversationsList } from "./ConversationsList";
import { Sender } from "./Sender";
import { MainModelSelection } from "./MainModelSelection";
import type { MainSelection } from "@/domain/runtime";
import { ConversationDialog, type ConversationAction } from "./ConversationActions";
import { ChatRequestParametersMenu } from "./ChatRequestParametersMenu";
import { useChatSettings, type ChatSettingsUi } from "@/components/chat-workspace/useChatSettings";
import type { SenderDraft, SenderHandle } from "./composer-draft";
import { useToast } from "@/components/ui/toast";
import { useAttachmentDrafts } from "./useAttachmentDrafts";
import { AttachmentDrafts, AttachmentDrop, AttachmentPicker } from "./AttachmentDrafts";
import { SubmissionRecovery } from "./SubmissionRecovery";
import { mainChatDraftSession, type ChatDraftSession } from "./chat-draft-session";
import { scopedChatExecution } from "@/components/chat-workspace/chat-sender-policy";
import { useDesktopChatImagePaste } from "./useDesktopChatImagePaste";

const CHAT_HEADER_ACTION_CLASS =
  "shrink-0 text-muted-foreground";

export function ChatView({ onBack }: { readonly onBack?: () => void }) {
  const recoveryConversation = useRef(pendingChatConversationId());
  const toast = useToast("chat-conversations");
  const workspace = useChatWorkspace({ preferredConversationId: recoveryConversation.current });
  const userName = useChatUserName(workspace.state.status === "ready");
  const send = useChatSend(workspace.reloadSelectedConversationHistory,
    workspace.state.status === "ready" ? workspace.state.workspace.selectedConversationId : null,
    workspace.state.status === "ready" ? workspace.state.workspace.history?.messages : undefined);
  useEffect(() => {
    if (workspace.state.status === "ready") void send.reconcilePending();
  }, [workspace.state.status, workspace.state.status === "ready" ? workspace.state.workspace.selectedConversationId : null, send.reconcilePending]);
  const chatSettings = useChatSettings(workspace, send);
  const realtime = useChatRealtime(workspace.state, send.state, {
    reconcileEvent: async event => {
      const current = send.getState();
      if ((current.kind === "finalization-uncertain" || current.kind === "regenerate-finalization-uncertain") && event.type !== "message-deleted") {
        await send.retryFinalization();
      } else await workspace.reconcileSelectedConversationRealtimeEvent(event);
    },
    reconcileAfterReconnect: async conversationId => {
      const current = send.getState();
      if (current.kind === "finalization-uncertain" || current.kind === "regenerate-finalization-uncertain") await send.retryFinalization();
      else await workspace.reconcileSelectedConversationAfterReconnect(conversationId);
    },
    refreshConversationList: async () => { await send.reconcilePending(); await workspace.refreshConversationList(); },
  });

  const selectConversation = (conversationId: string) => {
    workspace.selectConversation(conversationId);
  };

  const sendMessage = async (content: string, attachments: readonly string[] = [], expectedOwner?: string): Promise<boolean> => {
    let current = workspace.getState();
    if (current.status === "ready" && current.workspace.history?.window && !current.workspace.history.window.reachesLatest && current.workspace.selectedConversationId) {
      try { await workspace.navigateHistory(current.workspace.selectedConversationId); } catch { return false; }
      current = workspace.getState();
    }
    if (
      current.status !== "ready" ||
      current.workspace.selectedConversation === null ||
      (expectedOwner !== undefined && current.workspace.selectedConversation.id !== expectedOwner) ||
      (!getChatSenderAvailability(current, send.getState(current.workspace.selectedConversationId ?? undefined)).enabled || chatSettings.controller.isSaving())
    ) {
      return Promise.resolve(false);
    }
    return send.send({
      conversationId: current.workspace.selectedConversation.id,
      content,
      ...(attachments.length ? { generation: { attachments } } : {}),
    });
  };

  const regenerateMessage = (messageId: string): Promise<boolean> => {
    const current = workspace.getState();
    if (current.status !== "ready") {
      return Promise.resolve(false);
    }
    const availability = getChatRegenerateAvailability(
      current,
      send.getState(current.workspace.selectedConversationId ?? undefined),
    );
    if (
      !availability.enabled || chatSettings.controller.isSaving() ||
      availability.target === null ||
      availability.target.id !== messageId
    ) {
      return Promise.resolve(false);
    }
    return send.regenerate({
      conversationId: availability.target.conversationId,
      targetMessageId: availability.target.id,
      targetCreatedAt: availability.target.createdAt,
    });
  };

  const refreshState = async () => {
    if (workspace.state.status !== "ready") return;
    const conversationId = workspace.state.workspace.selectedConversationId;
    await workspace.refreshConversationList();
    if (conversationId !== null) await workspace.reloadSelectedConversationHistory(conversationId);
  };

  const recoverExecution = async () => {
    await send.retryFinalization();
    try { await workspace.refreshConversationList(); } catch { /* Retain current safe setup state. */ }
  };

  return (
    <ChatWorkspaceView
      state={workspace.state}
      userName={userName}
      onRetry={workspace.retry}
      onSelectConversation={selectConversation}
      onRetryConversationSwitch={workspace.retryConversationSwitch}
      onBack={onBack}
      draftSession={mainChatDraftSession}
      isConversationExecuting={send.isExecutionActive}
      sendState={send.state}
      getSendState={send.getState}
      onSend={sendMessage}
      onRegenerate={regenerateMessage}
      onRetryFinalization={recoverExecution}
      onReleaseAfterReview={send.releaseAfterReview}
      onSaveMainSelection={workspace.saveMainSelection}
      chatSettings={chatSettings}
      onRefreshState={refreshState}
      realtimeState={realtime}
      onCreateConversation={async () => {
        await workspace.createConversation();
        const current = workspace.getState();
        if (current.status === "ready" && !current.conversationMutation) toast.show({ type: "success", text: "会话已创建" });
      }}
      onRenameConversation={async (id, title) => { await workspace.renameConversation(id, title); toast.show({ type: "success", text: "会话已重命名" }); }}
      onDeleteConversation={async (id) => {
        if (send.isExecutionActive(id)) throw new Error("该会话的请求尚未结束，暂不能删除。");
        await workspace.deleteConversation(id);
        toast.show({ type: "success", text: "会话已删除" });
      }}
      onLoadOlderHistory={workspace.loadOlderHistory}
      onLoadNewerHistory={workspace.loadNewerHistory}
      onNavigateHistory={workspace.navigateHistory}
      onRefreshConversationList={workspace.refreshConversationList}
    />
  );
}

export interface ChatWorkspaceViewProps {
  readonly state: ChatWorkspaceControllerState;
  readonly userName?: string;
  readonly onRetry: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onRetryConversationSwitch: () => void;
  readonly sendState?: ChatSendState;
  readonly draftSession?: ChatDraftSession;
  readonly isConversationExecuting?: (id: string) => boolean;
  readonly getSendState?: (conversationId?: string) => ChatSendState;
  readonly onSend?: (content: string, attachments?: readonly string[], expectedOwner?: string) => Promise<boolean>;
  readonly onRegenerate?: (messageId: string) => Promise<boolean>;
  readonly onRetryFinalization?: () => void | Promise<void>;
  readonly onReleaseAfterReview?: () => void;
  readonly onSaveMainSelection?: (conversationId: string, selection: MainSelection) => Promise<void>;
  readonly chatSettings?: ChatSettingsUi;
  readonly onRefreshState?: () => Promise<void>;
  readonly realtimeState?: ChatRealtimeState;
  readonly onBack?: () => void;
  readonly onCreateConversation?: () => Promise<void>;
  readonly onRenameConversation?: (id: string, title: string) => Promise<void>;
  readonly onDeleteConversation?: (id: string) => Promise<void>;
  readonly onLoadOlderHistory?: () => Promise<void>;
  readonly onLoadNewerHistory?: () => Promise<void>;
  readonly onNavigateHistory?: (conversationId: string, messageId?: string) => Promise<void>;
  readonly onRefreshConversationList?: () => Promise<void>;
}

export function ChatWorkspaceView({
  state,
  userName,
  onRetry,
  onSelectConversation,
  onRetryConversationSwitch,
  sendState: suppliedSendState = INITIAL_CHAT_SEND_STATE,
  draftSession,
  isConversationExecuting,
  getSendState,
  onSend,
  onRegenerate,
  onRetryFinalization,
  onReleaseAfterReview,
  onSaveMainSelection,
  chatSettings,
  onRefreshState,
  realtimeState = { kind: "idle" },
  onBack,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  onLoadOlderHistory,
  onLoadNewerHistory,
  onNavigateHistory,
  onRefreshConversationList,
}: ChatWorkspaceViewProps) {
  const sendState = scopedChatExecution(suppliedSendState, state.status === "ready" ? state.workspace.selectedConversationId : null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modelSelectionPending, setModelSelectionPending] = useState(false);
  const [conversationAction, setConversationAction] = useState<ConversationAction | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const drafts = useRef(draftSession?.texts ?? new Map<string, SenderDraft>());
  const senderRef = useRef<SenderHandle | null>(null);
  const ownerRef = useRef<string | null>(null);
  ownerRef.current = state.status === "ready" ? state.workspace.selectedConversationId : null;
  const media = useAttachmentDrafts(ownerRef.current, draftSession?.attachments);
  const pasteScopeRef = useRef<HTMLDivElement>(null);
  const draftOwner = ownerRef.current;
  // Workspace readiness gates editing; execution ownership only gates submission.
  const draftEditable = getChatSenderAvailability(state, INITIAL_CHAT_SEND_STATE).enabled && !modelSelectionPending && onSend !== undefined;
  const receiveFiles = useCallback((files: readonly File[]) => {
    if (draftOwner && ownerRef.current === draftOwner) media.store.add(draftOwner, files);
  }, [draftOwner, media.store]);
  useDesktopChatImagePaste(pasteScopeRef, draftEditable ? receiveFiles : undefined);
  useEffect(() => {
    const confirmed = sendState.kind === "idle" ? sendState.confirmedSend : sendState.kind === "error" ? sendState.acceptedSend : undefined;
    if (!confirmed) return;
    media.store.getRecoveries(confirmed.conversationId).forEach(item => {
      if (item.clientMessageId === confirmed.clientMessageId) media.store.discardRecovery(confirmed.conversationId, item.id);
    });
  }, [sendState, media.recoveries, media.store]);
  const search = useChatSearch(state.status === "ready" && !state.pendingConversationId ? ownerRef.current : null, state.status === "ready" ? state.searchRevision : 0);
  const readingRef=useRef<ChatReadingHandle|null>(null);
  const bookmark=useRef<{owner:string;position:ReadingBookmark}|null>(null);
  const userRead=useRef(false), jumped=useRef(false), jumpSequence=useRef(0);
  const [jump,setJump]=useState<ChatJump|null>(null), [navigationError,setNavigationError]=useState<string|null>(null), [searchFollowing,setSearchFollowing]=useState(false);
  const closeRef=useRef<()=>void>(()=>{});
  const searchTrigger=useRef<HTMLButtonElement|null>(null);
  useSearchBack(search.open,()=>closeRef.current());
  useEffect(()=>{bookmark.current=null;userRead.current=false;jumped.current=false;jumpSequence.current++;setJump(null);setNavigationError(null);},[ownerRef.current]);
  useEffect(()=>{
    if(!search.open)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!event.defaultPrevented&&!hasOpenChatDialog()){event.preventDefault();closeRef.current();}};
    document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape);
  },[search.open]);
  useEffect(() => {
    if (state.status !== "ready") return;
    const existing = new Set(state.workspace.conversations.map(item => item.id));
    media.store.owners().forEach(id => { if (!existing.has(id)) { media.store.delete(id); drafts.current.delete(id); } });
  }, [state, media.store]);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <TooltipProvider delay={300}>
        <ChatWorkspaceLoading onBack={onBack} />
      </TooltipProvider>
    );
  }

  if (state.status === "error") {
    return (
      <TooltipProvider delay={300}>
        <ChatWorkspaceError error={state.error} onRetry={onRetry} onBack={onBack} />
      </TooltipProvider>
    );
  }

  const { workspace, pendingConversationId, switchError } = state;
  const conversations = presentChatConversations(workspace.conversations, {
    selectedConversationId: workspace.selectedConversationId,
    pendingConversationId,
  });
  const selectedConversation = conversations.find(({ isSelected }) => isSelected) ?? null;
  const messages = composeVisibleChatMessages(
    workspace.history?.messages ?? [],
    search.open || workspace.history?.window && !workspace.history.window.reachesLatest ? INITIAL_CHAT_SEND_STATE : sendState,
    workspace.selectedConversationId ?? "",
  );
  const sender = getChatSenderAvailability(state, sendState);
  const executionNoticeVisible = executionNoticeError(sendState) !== null;
  const regenerate = getChatRegenerateAvailability(state, sendState);
  const executionActive = isChatExecutionActive(sendState);
  const navigationLocked = !!state.conversationMutation;
  const managementLocked = navigationLocked || pendingConversationId !== null || !!state.configurationPending || modelSelectionPending;
  const canManage = onRenameConversation !== undefined && onDeleteConversation !== undefined;
  const owner=workspace.selectedConversationId;
  const returnReading=async()=>{
    const original=bookmark.current;
    if(!owner||original?.owner!==owner)return;
    const sequence=++jumpSequence.current;
    try {
      const id=original.position.anchor?.id;
      if(original.position.following)await onNavigateHistory?.(owner);
      else if(id&&!workspace.history?.messages.some(m=>m.id===id))await onNavigateHistory?.(owner,id);
      if(sequence!==jumpSequence.current||ownerRef.current!==owner)return;
      setSearchFollowing(original.position.following);
      setJump({token:sequence,messageId:original.position.following?undefined:id,offset:original.position.anchor?.offset,following:original.position.following});
      userRead.current=false;jumped.current=false;setNavigationError(null);
    }catch{if(sequence===jumpSequence.current)setNavigationError("搜索前的位置已失效或暂时无法读取。当前阅读位置已保留，可回到最新。");}
  };
  const closeSearch=()=>{
    if(jumped.current&&!userRead.current)void returnReading();
    else if(!jumped.current&&bookmark.current?.position.following&&!userRead.current)readingRef.current?.resumeFollowing();
    search.dismiss();setNavigationError(null);
    requestAnimationFrame(()=>searchTrigger.current?.focus({preventScroll:true}));
  };
  closeRef.current=closeSearch;
  const showSearch=()=>{
    if(!owner)return;
    bookmark.current={owner,position:readingRef.current?.capture()??{anchor:null,following:true}};
    userRead.current=false;jumped.current=false;setSearchFollowing(false);readingRef.current?.suspend();search.show();
  };
  const latest=async()=>{
    if(!owner)return;const sequence=++jumpSequence.current;
    try{await onNavigateHistory?.(owner);if(sequence!==jumpSequence.current||ownerRef.current!==owner)return;setSearchFollowing(true);setJump({token:sequence,following:true});userRead.current=true;setNavigationError(null);}
    catch{if(sequence===jumpSequence.current)setNavigationError("最新历史暂时无法读取，当前阅读位置已保留。");}
  };
  const jumpResult=async(result:MessageSearchResult)=>{
    if(!owner)return;
    const sequence=++jumpSequence.current;
    try{
      readingRef.current?.suspend();setSearchFollowing(false);
      if(!workspace.history?.messages.some(m=>m.id===result.messageId))await onNavigateHistory?.(owner,result.messageId);
      if(sequence!==jumpSequence.current||ownerRef.current!==owner)return;
      search.select(result.messageId);jumped.current=true;userRead.current=false;
      setJump({token:sequence,messageId:result.messageId});setNavigationError(null);
    }catch{if(sequence===jumpSequence.current)setNavigationError("目标消息已删除、身份失效或暂时无法读取。当前历史已保留。");}
  };
  const selectedResult=search.state.items.find(m=>m.messageId===search.state.selected);
  const selectedMessage=workspace.history?.messages.find(m=>m.id===search.state.selected);
  const liveSnippets=selectedMessage?.searchSegments?.flatMap(segment=>{
    const text=segment.text.replace(/\s+/gu," "), range=searchTextRanges(text,search.query)[0];
    if(!range)return[];
    const start=Math.max(0,range[0]-60),end=Math.min(text.length,Math.max(range[1],range[0]+160),start+320);
    return [{segmentKey:segment.segmentKey,text:text.slice(start,end),matchRanges:[]}];
  }).slice(0,3)??[];
  const activeResult=selectedMessage&&liveSnippets.length?{
    messageId:selectedMessage.id,createdAt:selectedMessage.createdAt,role:selectedMessage.roleKind as MessageSearchResult["role"],
    publicRevision:selectedResult?.publicRevision??"current-window",snippets:liveSnippets,
  }:null;
  const create = async () => {
    if (managementLocked || !onCreateConversation) return;
    setManagementError(null);
    try { await onCreateConversation(); setSheetOpen(false); }
    catch { setManagementError("新建会话未确认，原会话与草稿已保留。请刷新列表核对后再试。"); }
  };
  const refreshList = async () => {
    setManagementError(null);
    try { await onRefreshConversationList?.(); }
    catch { setManagementError("会话列表更新失败，请稍后重试。"); }
  };
  const listManagement = {
    onCreate: onCreateConversation ? () => { void create(); } : undefined,
    onAction: canManage ? (action: ConversationAction) => {
      if (action.kind === "delete" && (isConversationExecuting?.(action.id) ?? (action.id === draftOwner && executionActive))) return;
      const target = workspace.conversations.find(({ id }) => id === action.id);
      if (!target) return;
      setSheetOpen(false);
      setConversationAction({ ...action, title: target.title });
    } : undefined,
    managementDisabled: managementLocked,
    deleteDisabled: (id: string) => isConversationExecuting?.(id) ?? (id === draftOwner && executionActive),
    creating: state.conversationMutation === "create",
  };
  const forceFollowKey = sendState.kind === "sending-user" ||
    sendState.kind === "streaming" ||
    sendState.kind === "finalizing" ||
    sendState.kind === "finalization-uncertain"
    ? sendState.executionId
    : null;

  const selectConversation = (conversationId: string) => {
    if (navigationLocked) return;
    onSelectConversation(conversationId);
    setSheetOpen(false);
  };

  return (
    <TooltipProvider delay={300}>
      <ChatShell rootRef={pasteScopeRef} sidebar={<ConversationsList
          conversations={conversations}
          onSelect={selectConversation}
          disabled={navigationLocked}
          {...listManagement}
          className="hidden w-[280px] shrink-0 md:flex"
        />}
        header={<header className="chat-workspace-header flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background/10 px-2 text-foreground backdrop-blur-xl sm:gap-2 sm:px-4">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className={CHAT_HEADER_ACTION_CLASS}
                onClick={onBack}
                disabled={false}
                aria-label="返回桌面"
                title="返回桌面"
              >
                <ArrowLeft className="size-4.5" aria-hidden="true" />
              </Button>
            )}

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className={`${CHAT_HEADER_ACTION_CLASS} md:hidden`}
                    aria-label="打开会话列表"
                    title="打开会话列表"
                  />
                }
              >
                <Menu className="size-4.5" aria-hidden="true" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="chat-conversations-drawer w-[280px] gap-0 p-0"
              >
                <SheetTitle className="sr-only">会话列表</SheetTitle>
                <ConversationsList
                  conversations={conversations}
                  onSelect={selectConversation}
                  disabled={navigationLocked}
                  {...listManagement}
                  mobileDrawer
                  className="h-full w-full"
                />
              </SheetContent>
            </Sheet>

            <HeaderCopy title={selectedConversation?.title ?? "Penumbra"} />
            <Button ref={searchTrigger} variant="ghost" size="icon-lg" className={CHAT_HEADER_ACTION_CLASS} aria-label="搜索聊天历史" title="搜索聊天历史" disabled={!selectedConversation||pendingConversationId!==null} onClick={search.open?closeSearch:showSearch}><Search className="size-4.5" aria-hidden="true"/></Button>
            <ChatRequestParametersMenu settings={chatSettings} disabled={!!state.conversationMutation || pendingConversationId !== null || !!state.configurationPending || modelSelectionPending} />
            {pendingConversationId && (
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" role="status">
                <LoaderCircle
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">正在切换会话</span>
              </span>
            )}
          </header>}
        overlay={<>
          <ChatSearchReveal key={workspace.selectedConversationId} open={search.open}><ChatSearchPanel search={search} onJump={result=>void jumpResult(result)} onClose={closeSearch} onReturn={()=>void returnReading()} onLatest={()=>void latest()} pending={state.historyNavigationPending} error={navigationError}/>
          {search.open&&selectedMessage?.searchSegments&&normalizeSearch(search.query)&&!activeResult&&<p className="px-4 py-1 text-xs text-muted-foreground" role="status">当前消息已更新或不再匹配关键词，仍保留原消息身份。</p>}</ChatSearchReveal>
          {!search.open&&navigationError&&<p role="alert" className="pointer-events-auto px-4 py-2 text-xs text-muted-foreground">{navigationError}<button className="ml-2 underline" onClick={()=>void latest()}>回到最新</button></p>}
          {!search.open&&bookmark.current&&jumped.current&&<div className="pointer-events-auto flex justify-end gap-3 px-4 text-xs text-muted-foreground"><button className="min-h-9" onClick={()=>void returnReading()}>返回搜索前位置</button><button className="min-h-9" onClick={()=>void latest()}>回到最新</button></div>}
        </>}
        notices={<>
          {state.conversationMutation && <p className="border-b border-border px-4 py-1.5 text-xs text-muted-foreground" role="status">正在更新会话，请稍候。</p>}
          {(managementError || state.conversationListError) && <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs" role="alert">
            <span className="flex-1">{managementError ?? state.conversationListError?.message}</span>
            <Button variant="ghost" size="sm" disabled={managementLocked} onClick={() => void refreshList()}>刷新列表</Button>
          </div>}
          {switchError && (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-muted-strong"
              role="alert"
            >
              <span className="min-w-0 flex-1">{switchError.message}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetryConversationSwitch}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                重试切换
              </Button>
            </div>
          )}

          <ChatRealtimeNotice state={realtimeState} />
        </>}
        composer={<AttachmentDrop disabled={!draftEditable} onFiles={receiveFiles}><Sender
          key={draftOwner ?? "unselected"}
          initialDraft={draftOwner ? drafts.current.get(draftOwner) : undefined}
          onDraftChange={draftOwner ? (draft) => { drafts.current.set(draftOwner, draft); } : undefined}
          apiRef={senderRef}
          disabled={!draftEditable}
          submitDisabled={!sender.enabled || modelSelectionPending || !!chatSettings?.state.saving}
          placeholder="输入消息…"
          statusMessage={executionActive || executionNoticeVisible ? undefined : modelSelectionPending ? "正在切换模型…" : sender.statusMessage ?? undefined}
          feedback={<><ChatExecutionNotice state={sendState} onRetryFinalization={onRetryFinalization} onReleaseAfterReview={onReleaseAfterReview} />
            <SubmissionRecovery items={media.recoveries.filter(item => !(executionActive && "optimisticUser" in sendState && item.clientMessageId === sendState.optimisticUser?.clientMessageId))} locked={!draftEditable || executionActive} onRestore={item => {
              if (!draftOwner || ownerRef.current !== draftOwner || executionActive || !draftEditable) return;
              if (!media.store.getRecoveries(draftOwner).some(current => current.id === item.id)) return;
              if (item.content && !senderRef.current?.append(item.content)) return;
              media.store.restoreRecovery(draftOwner, item.id);
            }} onDiscard={id => { if (draftOwner && ownerRef.current === draftOwner && !executionActive && draftEditable) media.store.discardRecovery(draftOwner, id); }} /></>}
          hasAttachments={media.items.length > 0}
          attachmentsReady={media.ready}
          onFiles={receiveFiles}
          attachments={draftOwner ? <AttachmentDrafts owner={draftOwner} store={media.store} items={media.items} disabled={!draftEditable} /> : undefined}
          onSend={onSend ? async content => {
            if (!draftOwner || ownerRef.current !== draftOwner) return false;
            if(workspace.history?.window&&!workspace.history.window.reachesLatest){try{await onNavigateHistory?.(draftOwner);search.dismiss();setSearchFollowing(true);setJump({token:++jumpSequence.current,following:true});}catch{return false;}}
            const snapshot = media.store.capture(draftOwner);
            if (!snapshot) return false;
            const beforeSubmission = getSendState?.(draftOwner);
            const previouslyConfirmed = beforeSubmission?.kind === "idle" ? beforeSubmission.confirmedSend?.clientMessageId : undefined;
            const previousClientMessageId = beforeSubmission && "optimisticUser" in beforeSubmission ? beforeSubmission.optimisticUser?.clientMessageId
              : beforeSubmission?.kind === "error" ? beforeSubmission.rejectedSubmission?.clientMessageId ?? beforeSubmission.acceptedSend?.clientMessageId : previouslyConfirmed;
            const preserve = () => {
              const current = getSendState?.(draftOwner);
              const clientMessageId = current && "optimisticUser" in current && current.conversationId === draftOwner
                ? current.optimisticUser?.clientMessageId : undefined;
              if (current?.kind === "idle" && current.confirmedSend?.conversationId === draftOwner && current.confirmedSend.clientMessageId !== previouslyConfirmed) snapshot.accept();
              else snapshot.preserve(content, clientMessageId);
            };
            try {
              const accepted = await onSend(content, snapshot.urls, draftOwner);
              if (accepted) { snapshot.accept(); return true; }
              const result = getSendState?.(draftOwner);
              if (result?.kind === "error" && result.rejectedSubmission && result.rejectedSubmission.clientMessageId !== previousClientMessageId && result.conversationId === draftOwner) return false;
              preserve(); return "retained";
            } catch { preserve(); return "retained"; }
            finally { snapshot.release(); }
          } : undefined}
          toolsLabel={`会话模型：${workspace.setup.configuration?.selection?.model ?? "尚未选择"}`}
          tools={<><AttachmentPicker disabled={!draftEditable} onFiles={receiveFiles} /><MainModelSelection
            key={workspace.selectedConversationId}
            setup={workspace.setup}
            disabled={navigationLocked || pendingConversationId !== null}
            configurationPending={!!state.configurationPending}
            onPendingChange={setModelSelectionPending}
            onSave={onSaveMainSelection}
            onRefresh={onRefreshState}
          /></>}
        /></AttachmentDrop>}
      >
          {workspace.conversations.length === 0 ? (
            <ChatWorkspaceEmpty kind="conversations" />
          ) : workspace.selectedConversation === null || workspace.history === null ? (
            <ChatWorkspaceEmpty kind="selection" />
           ) : messages.length === 0 && workspace.history.olderPageStatus !== "maybe-more" && !workspace.history.window?.hasNewer ? (
            <ChatWorkspaceEmpty kind="history" />
          ) : (
            <BubbleList
              readingRef={readingRef}
              jump={jump}
              readingMode={(search.open&&!searchFollowing)||workspace.history.window?.reachesLatest===false}
              query={search.open?search.query:""}
              activeMessageId={search.open?search.state.selected:null}
              activeResult={activeResult}
              onUserRead={()=>{userRead.current=true;}}
              onLoadNewer={onLoadNewerHistory?()=>void onLoadNewerHistory():undefined}
              hasNewer={workspace.history.window?.hasNewer||workspace.history.hasNewMessages}
              newerPending={state.newerHistoryPending}
              newerError={state.newerHistoryError?.message}
              onLatest={()=>void latest()}
              timelineKey={workspace.selectedConversation.id}
              messages={messages}
              userName={userName}
              onInsert={draftEditable && !managementLocked && !modelSelectionPending ? (text) => {
                if (ownerRef.current === draftOwner) senderRef.current?.append(text);
              } : undefined}
              onLoadOlder={onLoadOlderHistory ? () => { void onLoadOlderHistory(); } : undefined}
              olderStatus={workspace.history.olderPageStatus}
              olderPending={state.olderHistoryPending}
              olderError={state.olderHistoryError?.message}
              forceFollowKey={forceFollowKey}
              regenerateTargetId={regenerate.target?.id ?? null}
              regenerateUnavailableReason={regenerate.reason ?? "仅最新的普通回复可重新生成。"}
              regenerateEnabled={regenerate.enabled && !modelSelectionPending && onRegenerate !== undefined}
              onRegenerate={onRegenerate === undefined
                ? undefined
                : (messageId) => {
                    void onRegenerate(messageId);
                  }}
            />
          )}

      </ChatShell>
      {conversationAction && onRenameConversation && onDeleteConversation && <ConversationDialog
        key={`${conversationAction.kind}:${conversationAction.id}`}
        action={conversationAction}
        locked={managementLocked}
        onRename={onRenameConversation}
        onDelete={async (id) => { await onDeleteConversation(id); drafts.current.delete(id); media.store.delete(id); }}
        onClose={() => setConversationAction(null)}
      />}
    </TooltipProvider>
  );
}

function ChatRealtimeNotice({
  state,
}: {
  readonly state: ChatRealtimeState;
}) {
  if (state.kind !== "unavailable" && state.kind !== "reconnecting") {
    return null;
  }

  return (
    <div
      className="shrink-0 border-b border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground"
      role="status"
    >
      {state.kind === "reconnecting"
        ? "实时连接正在恢复，历史记录与发送仍可使用。"
        : "实时连接暂时不可用，历史记录与发送仍可使用。"}
    </div>
  );
}

function ChatExecutionNotice({ state, onRetryFinalization }: {
  readonly state: ChatSendState;
  readonly onRetryFinalization?: () => void | Promise<void>;
  readonly onReleaseAfterReview?: () => void;
}) {
  const error = executionNoticeError(state);
  if (error === null) return null;
  if (state.kind === "error" && state.confirmedFailure && state.failedMessageId) return null;
  if (state.kind === "error" && state.rejectedSubmission) return <p data-chat-execution-feedback role="alert" className="mx-auto mb-2 max-w-[720px] text-xs text-muted-strong">{error.message}</p>;
  const uncertain = state.kind === "finalization-uncertain" || state.kind === "regenerate-finalization-uncertain";
  const checking = state.kind === "finalizing" || state.kind === "regenerate-finalizing";
  if (uncertain || checking) return <div data-chat-execution-feedback className="mx-auto mb-2 flex max-w-[720px] items-center gap-2 text-xs text-muted-strong">
    <span role="status" title={error.message}>回复结果待确认</span>
    {onRetryFinalization && <Button variant="ghost" size="compact" disabled={checking} onClick={() => void onRetryFinalization()}>重新核对</Button>}
  </div>;
  // Streamed provider errors are already displayed next to their partial body.
  if (state.kind !== "error") return null;
  return <ChatExecutionFeedback summary="暂时无法发送" detail={error.message} uncertain={false} reviewReady={false} onRefresh={onRetryFinalization} />;
}

function executionNoticeError(state: ChatSendState) {
  switch (state.kind) {
    case "error":
    case "finalization-uncertain":
    case "regenerate-finalization-uncertain":
      return state.error;
    case "streaming":
    case "finalizing":
    case "regenerate-streaming":
    case "regenerate-finalizing":
      return state.executionError;
    case "idle":
    case "sending-user":
      return null;
  }
}

function HeaderCopy({
  title,
}: {
  readonly title: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}
