import { useRef, useState, type FormEvent } from "react";

import type { SafeMemoryCreateError } from "@/application/memory-list";
import {
  MEMORY_TYPE_OPTIONS,
  type KnownMemoryType,
} from "@/components/memory/memory-presentation";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

  const requestOpenChange = (nextOpen: boolean, details?: { cancel(): void }) => {
    if (!nextOpen && isCreating) { details?.cancel(); return; }
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
        data-memory-create-dialog="true"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isCreating}
        >
          <DialogHeader>
            <p className="font-decorative text-[11px] font-normal uppercase leading-4 tracking-[0.14em] text-muted-foreground">
              ADD MEMORY
            </p>
            <DialogTitle>
              新增记忆
            </DialogTitle>
            <DialogDescription>
              留下一段值得记住的内容。
            </DialogDescription>
            <DialogCloseButton
              disabled={isCreating}
              aria-label="关闭新增记忆"
              title="关闭新增记忆"
            />
          </DialogHeader>

          <DialogBody className="pb-3">
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
                  className="scrollbar-none min-h-28 max-h-44 resize-none overflow-y-auto rounded-xl px-3 py-2.5 text-[15px] leading-6 shadow-none md:text-sm"
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
            {createError && (
              <div
                role="alert"
                className={cn(
                  "mt-3 rounded-xl border px-3 py-2 text-xs leading-5",
                  createError.code === "uncertain"
                    ? "border-warning/20 bg-warning-subtle text-warning-foreground"
                    : "border-destructive/15 bg-destructive-subtle text-destructive-foreground",
                )}
                data-memory-create-error={createError.code}
              >
                {createError.message}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
