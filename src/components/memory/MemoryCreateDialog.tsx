import { useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import type { SafeMemoryCreateError } from "@/application/memory-list";
import {
  MEMORY_TYPE_OPTIONS,
  type KnownMemoryType,
} from "@/components/memory/memory-presentation";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { CreateMemoryInput } from "@/domain/memory";
import { cn } from "@/lib/utils";

export const DEFAULT_MEMORY_IMPORTANCE = 0.5;
export const DEFAULT_MEMORY_TYPE: KnownMemoryType = "event";

export function normalizeMemoryKeywordText(value: string): readonly string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const candidate of value.split(/[,，]/)) {
    const keyword = candidate.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }
  return keywords;
}

export function MemoryCreateDialog({
  open,
  isCreating,
  createError,
  onOpenChange,
  onCreate,
  onClearError,
}: {
  readonly open: boolean;
  readonly isCreating: boolean;
  readonly createError: SafeMemoryCreateError | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (input: CreateMemoryInput) => Promise<boolean>;
  readonly onClearError: () => void;
}) {
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(DEFAULT_MEMORY_IMPORTANCE);
  const [type, setType] = useState<KnownMemoryType>(DEFAULT_MEMORY_TYPE);
  const [keywordText, setKeywordText] = useState("");
  const [showContentError, setShowContentError] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const resetForm = () => {
    setContent("");
    setImportance(DEFAULT_MEMORY_IMPORTANCE);
    setType(DEFAULT_MEMORY_TYPE);
    setKeywordText("");
    setShowContentError(false);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isCreating) return;
    if (!nextOpen) {
      resetForm();
      onClearError();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      setShowContentError(true);
      return;
    }
    if (isCreating) return;

    const created = await onCreate({
      content: normalizedContent,
      importance,
      type,
      keywords: normalizeMemoryKeywordText(keywordText),
    });
    if (created) {
      resetForm();
      onOpenChange(false);
    }
  };

  const contentInvalid = showContentError && !content.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={requestOpenChange}
      disablePointerDismissal={isCreating}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={contentRef}
        className="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-0 overflow-hidden rounded-[28px] p-0 sm:max-w-lg"
        data-memory-create-dialog="true"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isCreating}
        >
          <DialogHeader className="relative shrink-0 gap-0 border-b border-border/60 px-5 pb-4 pt-5 pr-16 sm:px-6 sm:pb-5 sm:pt-6 sm:pr-16">
            <p className="font-decorative text-[11px] font-normal uppercase leading-4 tracking-[0.14em] text-muted-foreground">
              ADD MEMORY
            </p>
            <DialogTitle className="mt-0.5 font-sans text-lg font-semibold leading-7 text-foreground">
              新增记忆
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
              留下一段值得记住的内容。
            </DialogDescription>
            <DialogClose
              disabled={isCreating}
              aria-label="关闭新增记忆"
              title="关闭新增记忆"
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="absolute right-3 top-3 size-11 rounded-xl text-muted-strong hover:bg-background/45 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 sm:right-4 sm:top-4"
                />
              }
            >
              <X className="size-4" aria-hidden="true" />
            </DialogClose>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 pt-5 sm:px-6">
            <div>
              <div>
                <label
                  htmlFor="memory-create-content"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  内容
                </label>
                <Textarea
                  ref={contentRef}
                  id="memory-create-content"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    if (event.target.value.trim()) setShowContentError(false);
                  }}
                  disabled={isCreating}
                  surface="translucent"
                  placeholder="写下这段记忆……"
                  rows={5}
                  autoFocus
                  aria-invalid={contentInvalid || undefined}
                  aria-describedby={contentInvalid ? "memory-create-content-error" : undefined}
                  className="min-h-28 max-h-44 resize-none overflow-y-auto rounded-xl px-3 py-2.5 text-[15px] leading-6 shadow-none md:text-sm"
                />
                {contentInvalid && (
                  <p
                    id="memory-create-content-error"
                    className="mt-1.5 text-xs leading-5 text-destructive-foreground"
                  >
                    写下一点内容再保存。
                  </p>
                )}
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-4">
                  <label
                    id="memory-create-importance-label"
                    className="text-sm font-normal text-foreground"
                  >
                    重要性
                  </label>
                  <output
                    className="min-w-8 text-right text-sm font-medium text-muted-strong"
                    aria-live="polite"
                  >
                    {importance.toFixed(1)}
                  </output>
                </div>
                <Slider
                  value={importance}
                  onValueChange={setImportance}
                  min={0}
                  max={1}
                  step={0.1}
                  disabled={isCreating}
                  ariaLabel="重要性"
                  className="mt-1"
                />
              </div>

              <div className="mt-3">
                <label className="mb-2 block text-sm font-normal text-foreground">
                  类型
                </label>
                <AppSelect
                  controlSize="comfortable"
                  value={type}
                  options={MEMORY_TYPE_OPTIONS}
                  onValueChange={setType}
                  ariaLabel="记忆类型"
                  disabled={isCreating}
                  surface="translucent"
                  align="start"
                  className="w-full rounded-xl bg-background/25 text-sm font-normal"
                  contentClassName="text-sm"
                />
              </div>

              <div className="mt-3.5">
                <label
                  htmlFor="memory-create-keywords"
                  className="mb-2 block text-sm font-normal text-foreground"
                >
                  关键词
                </label>
                <Input
                  controlSize="comfortable"
                  id="memory-create-keywords"
                  value={keywordText}
                  onChange={(event) => setKeywordText(event.target.value)}
                  disabled={isCreating}
                  surface="translucent"
                  placeholder="输入关键词，用逗号分隔"
                  className="rounded-xl px-3 shadow-none"
                />
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 px-5 py-3 sm:px-6">
            {createError && (
              <div
                role="alert"
                className={cn(
                  "mb-3 rounded-xl border px-3 py-2 text-xs leading-5",
                  createError.code === "uncertain"
                    ? "border-warning/20 bg-warning-subtle text-warning-foreground"
                    : "border-destructive/15 bg-destructive-subtle text-destructive-foreground",
                )}
                data-memory-create-error={createError.code}
              >
                {createError.message}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                size="comfortable"
                type="button"
                variant="ghost"
                disabled={isCreating}
                onClick={() => requestOpenChange(false)}
                className="text-muted-strong"
              >
                取消
              </Button>
              <Button
                size="comfortable"
                type="submit"
                disabled={isCreating || !content.trim()}
                aria-busy={isCreating}
                className="min-w-24"
              >
                {isCreating ? "保存中…" : "保存记忆"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
