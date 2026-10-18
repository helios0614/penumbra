export const QUICK_NOTE_TOP_THRESHOLD = 360;

export function showQuickNoteTopButton(scrollTop: number): boolean {
  return scrollTop > QUICK_NOTE_TOP_THRESHOLD;
}

export { scrollPageToTop as scrollQuickNoteToTop } from "@/components/ui/page-scroll";
