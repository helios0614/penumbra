import { RefreshCw, X } from "lucide-react";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeedbackToast } from "@/components/ui/toast";
import { DiaryCalendar } from "./DiaryCalendar";
import { DiaryReader } from "./DiaryReader";
import { useDiary } from "./useDiary";
import { useDiaryNavigation } from "./useDiaryNavigation";
import { useDiaryEditorNavigation } from "./useDiaryEditorNavigation";
import { DiaryDiscardDialog, DiaryEditor } from "./DiaryEditor";
import "./diary.css";
import { useDiaryChatNavigation } from "./useDiaryChatNavigation";
import { DiaryChatView } from "./DiaryChatView";
import { useDiaryFeed } from "./useDiaryFeed";
import { DiaryFeedAction } from "./DiaryFeedAction";
import { DiaryQuickExtract } from "./DiaryQuickExtract";

export function DiaryView({ onBack }: { readonly onBack?: () => void }) {
  const { state, controller, today } = useDiary();
  const navigation = useDiaryNavigation(state, controller);
  const chat = useDiaryChatNavigation(navigation.calendarRef, navigation.openButtonRef, navigation.dateButtonRef);
  const editing = useDiaryEditorNavigation(state, controller);
  const feed = useDiaryFeed(controller);
  const loading = state.reader ? state.reader.loading : state.calendarLoading;
  const refreshLabel = state.reader ? "刷新正文" : "刷新日历";
  useFeedbackToast(state.notice, state.notice ? { type: "success", text: state.notice.text, description: state.notice.description } : null, `${state.month}:${state.reader?.entryId ?? "calendar"}`);
  return <TooltipProvider>
    <main hidden={Boolean(chat.entryId)} style={chat.entryId ? { display: "none" } : undefined} className="mx-auto flex h-full max-h-dvh min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 pb-4 pt-5 sm:px-0 sm:pb-8 sm:pt-8" aria-labelledby="diary-page-title">
      <PageHeader eyebrow="DIARY" title="日记" titleId="diary-page-title" description="在时间的缝隙里，翻阅被留下来的日常。" actions={<>
        <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label={refreshLabel} disabled={!controller || loading || Boolean(state.editor)} onClick={() => { void controller?.refresh(); if (!state.reader) void controller?.loadAutoFeed(); }} />}><RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" /></TooltipTrigger><TooltipContent>{refreshLabel}</TooltipContent></Tooltip>
        {onBack && <Tooltip><TooltipTrigger render={<PageHeaderAction aria-label="返回桌面" disabled={Boolean(state.editor?.busy)} onClick={() => editing.exit(onBack)} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>返回桌面</TooltipContent></Tooltip>}
      </>} />
      <PageScrollArea scrollRef={navigation.calendarRef} hidden={Boolean(state.reader)} syncKey={`${state.month}:${state.reader ? "reader" : "calendar"}`} label="日记月历与日期预览" topLabel="回到月历顶部" className="mt-3 sm:mt-4" contentClassName="pb-2">
        <DiaryCalendar state={state} controller={controller} today={today} onOpen={navigation.open} onOpenChat={chat.open} openButtonRef={navigation.openButtonRef} dateButtonRef={navigation.dateButtonRef}
          feedAction={<DiaryFeedAction date={state.selectedDate} indexedEntryId={state.calendar?.items.find(item => item.date === state.selectedDate)?.entryId}
            state={feed.state} controller={feed.controller} onOpen={chat.openEntry}>
            <DiaryQuickExtract date={state.selectedDate} entryId={state.calendar?.items.find(item => item.date === state.selectedDate)?.entryId}
              onSaved={entry => controller?.acceptArchive(entry)} /></DiaryFeedAction>} />
      </PageScrollArea>
      {state.reader && !state.editor && <DiaryReader reader={state.reader} readerRef={navigation.readerRef} editButtonRef={editing.editButtonRef} onEdit={() => controller?.beginEdit()} onBack={navigation.back} onRetry={() => void controller?.refresh()} />}
      {state.editor && <DiaryEditor editor={state.editor} controller={controller} editorRef={editing.editorRef} onCancel={editing.cancel} />}
      <DiaryDiscardDialog open={Boolean(editing.discard)} busy={Boolean(state.editor?.busy)} onKeep={editing.keep} onDiscard={editing.confirm} finalFocus={() => state.editor ? true : editing.editButtonRef.current ?? true} />
    </main>
    {chat.entryId && <DiaryChatView key={chat.entryId} entryId={chat.entryId} onBack={chat.back} onArchived={entry => controller?.acceptArchive(entry)} />}
  </TooltipProvider>;
}
