import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import type { ArchivedDiary } from "@/domain/diary";
import { diaryTitle } from "@/application/diary-reader/diary-calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

// AionHome Diary's existing TAG_OPTIONS; keyword text is never translated as a tag code.
export const diaryTagLabels = new Map([
  ["shared_moment", "共同经历"], ["emotion", "情感时刻"], ["life_event", "重要事件"],
  ["preference", "喜好/雷区"], ["promise", "约定承诺"], ["milestone", "关系里程碑"],
]);

// Some mobile keyboards resize only visualViewport. Keep this adaptation local
// to Reader, using the same Dialog viewport variables as the shared foundation.
type DiaryVisualViewport = Pick<VisualViewport, "height" | "offsetTop" | "addEventListener" | "removeEventListener">;

export function trackDiaryReaderViewport(paper: HTMLElement, viewport: DiaryVisualViewport | null) {
  if (!viewport || !paper.parentElement) return () => {};
  const parent = paper.parentElement;
  const update = () => {
    const bottomSpace = parseFloat(window.getComputedStyle(parent).paddingBottom) || 0;
    const height = Math.max(0, viewport.offsetTop + viewport.height - paper.getBoundingClientRect().top - bottomSpace);
    paper.style.setProperty("--diary-reader-available-height", `${height}px`);
  };
  const observer = new ResizeObserver(update);
  observer.observe(parent);
  if (parent.firstElementChild) observer.observe(parent.firstElementChild);
  viewport.addEventListener("resize", update); viewport.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  update();
  return () => {
    observer.disconnect();
    viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    paper.style.removeProperty("--diary-reader-available-height");
  };
}

export function trackDiaryReaderDialogViewport(popup: HTMLElement, viewport: DiaryVisualViewport | null) {
  if (!viewport) return () => {};
  const update = () => {
    popup.style.setProperty("--dialog-viewport-height", `${viewport.height}px`);
    popup.style.setProperty("--dialog-viewport-top", `${viewport.offsetTop}px`);
  };
  viewport.addEventListener("resize", update); viewport.addEventListener("scroll", update); update();
  return () => {
    viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update);
    popup.style.removeProperty("--dialog-viewport-height"); popup.style.removeProperty("--dialog-viewport-top");
  };
}

export function diaryDialogViewportRef(popup: HTMLDivElement | null) {
  if (popup) return trackDiaryReaderDialogViewport(popup, window.visualViewport);
}

export function DiaryReaderPaper({ readerRef, children, label = "单篇日记阅读" }: { readonly readerRef?: Ref<HTMLElement>; readonly children: ReactNode; readonly label?: string }) {
  const ownRef = useRef<HTMLElement>(null);
  const bind = useCallback((node: HTMLElement | null) => {
    ownRef.current = node;
    if (typeof readerRef === "function") return readerRef(node);
    if (readerRef) readerRef.current = node;
  }, [readerRef]);
  useLayoutEffect(() => {
    if (ownRef.current) return trackDiaryReaderViewport(ownRef.current, window.visualViewport);
  }, []);
  return <section ref={bind} tabIndex={-1} className="diary-reader diary-paper mist-glass-strong mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] focus:outline-none sm:mt-4" aria-label={label}>{children}</section>;
}

export function DiaryReaderTags({ tags, full = false }: { readonly tags: readonly string[]; readonly full?: boolean }) {
  if (!tags.length) return null;
  return <ul className={full ? "diary-reader-chips-full" : "diary-reader-tags"} aria-label="日记标签">
    {tags.map((tag) => <li key={tag} className={`diary-reader-tag${full ? " diary-reader-chip-full" : ""}`}>{diaryTagLabels.get(tag) ?? tag}</li>)}
  </ul>;
}

function KeywordList({ keywords, full = false }: { readonly keywords: readonly string[]; readonly full?: boolean }) {
  return <ul className="diary-reader-chips-full" aria-label="日记关键词">
    {keywords.map((keyword) => <li key={keyword} className={`diary-reader-keyword${full ? " diary-reader-chip-full" : ""}`}>{keyword}</li>)}
  </ul>;
}

export function DiaryReaderHeading({ entry }: { readonly entry: ArchivedDiary }) {
  return <Popover>
    <h2 id="diary-entry-title" aria-label={diaryTitle(entry.title)}><PopoverTrigger data-diary-title-trigger aria-label="查看完整标题与分类" render={<Button variant="ghost" size="compact" className="diary-reader-title-trigger w-full min-w-0 justify-start gap-2 px-0 py-0 text-left" />}>
      <span className="diary-reader-title font-semibold text-foreground [overflow-wrap:anywhere]">{diaryTitle(entry.title)}</span>
      <ChevronDown className="diary-reader-title-chevron size-3 shrink-0 text-muted-foreground" aria-hidden="true" /><BookOpen className="diary-reader-title-compact size-4" aria-hidden="true" />
    </PopoverTrigger></h2>
    <DiaryReaderTags tags={entry.tags} />
    <PopoverContent className="scrollbar-none max-h-[min(24rem,var(--available-height))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4">
      <PopoverTitle className="sr-only">完整标题与分类</PopoverTitle>
      <p className="mb-3 whitespace-pre-wrap font-medium leading-7 [overflow-wrap:anywhere]">{diaryTitle(entry.title)}</p>
      <DiaryReaderTags tags={entry.tags} full />
    </PopoverContent>
  </Popover>;
}

/** Measure the real two-row window, including a single keyword ellipsized horizontally. */
export function observeDiaryKeywordOverflow(strip: HTMLElement, update: (overflow: boolean) => void) {
  const measure = () => update(strip.scrollHeight > strip.clientHeight + 1 || Array.from(strip.children).some((child) => child.scrollWidth > child.clientWidth + 1));
  const observer = new ResizeObserver(measure);
  observer.observe(strip);
  Array.from(strip.children).forEach((child) => observer.observe(child));
  measure();
  return () => observer.disconnect();
}

/** Closing after a resize must not return keyboard focus to a now-hidden trigger. */
export function diaryKeywordReturnFocus(strip: HTMLElement | null) {
  const footer = strip?.closest("footer");
  const triggers = footer?.querySelectorAll<HTMLButtonElement>("[data-diary-keywords-trigger]");
  return Array.from(triggers ?? []).find((button) => button.getClientRects().length > 0 && window.getComputedStyle(button).visibility !== "hidden")
    ?? footer?.closest(".diary-reader")?.querySelector<HTMLButtonElement>("[data-diary-edit-trigger]") ?? true;
}

export function DiaryReaderKeywords({ keywords }: { readonly keywords: readonly string[] }) {
  const stripRef = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState(false), [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip) return observeDiaryKeywordOverflow(strip, setOverflow);
  }, [keywords]);

  if (!keywords.length) return null;
  const label = `查看全部关键词，共${keywords.length}项`;
  return <footer className="diary-reader-keywords border-t border-primary/10" aria-label="日记关键词区">
    <div className="mx-auto w-full max-w-[42rem]">
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="diary-reader-keywords-preview" data-overflow={overflow}>
          <ul ref={stripRef} className="diary-reader-keyword-window" aria-label="日记关键词">
            {keywords.map((keyword) => <li key={keyword} className="diary-reader-keyword">{keyword}</li>)}
          </ul>
          <DialogTrigger data-diary-keywords-trigger className="diary-reader-keywords-more" aria-label={label} render={<Button type="button" variant="ghost" className="min-h-11 min-w-11 px-2 text-xs text-muted-strong" />}>全部</DialogTrigger>
        </div>
        <DialogTrigger data-diary-keywords-trigger className="diary-reader-keywords-compact" aria-label={label} render={<Button type="button" variant="ghost" className="min-h-11 max-w-full gap-2 px-2 text-xs text-muted-strong" />}>
          关键词 <span>{keywords.length}</span><ChevronUp className="size-3.5" aria-hidden="true" />
        </DialogTrigger>
        <DialogContent ref={diaryDialogViewportRef} finalFocus={() => diaryKeywordReturnFocus(stripRef.current)} closeButtonProps={{ "aria-label": "关闭全部关键词" }}>
          <DialogHeader>
            <DialogTitle>全部关键词</DialogTitle>
            <DialogDescription className="sr-only">按保存顺序展示全部关键词。</DialogDescription>
          </DialogHeader>
          <DialogBody><KeywordList keywords={keywords} full /></DialogBody>
          <DialogFooter><DialogClose render={<Button type="button" variant="ghost" size="comfortable" />}>关闭</DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </footer>;
}
