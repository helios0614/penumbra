import { useEffect } from "react";
import type { ArchivedDiary } from "@/domain/diary";
import { Button } from "@/components/ui/button";
import { DiaryExtractionPreview } from "./DiaryExtractionPreview";
import { useDiaryExtraction } from "./useDiaryExtraction";

export function DiaryQuickExtract({ entryId, date, onSaved }: { readonly entryId?: string; readonly date: string; readonly onSaved: (entry: ArchivedDiary) => void }) {
  const extraction = useDiaryExtraction(onSaved);
  useEffect(() => { extraction.controller?.reset(); }, [extraction.controller, entryId, date]);
  if (!entryId) return null;
  return <>
    <Button type="button" variant="soft-primary" size="comfortable" className="min-w-0 shrink px-3 text-xs font-normal" disabled={!extraction.controller || extraction.state.busy} onClick={() => void extraction.controller?.quickExtract(entryId, date)}>
      {extraction.state.busy ? "正在提取…" : "提取日记"}
    </Button>
    {extraction.state.error && !extraction.state.preview && <p role="status" className="basis-full text-xs leading-5 text-muted-strong">{extraction.state.error}</p>}
    <DiaryExtractionPreview {...extraction} />
  </>;
}
