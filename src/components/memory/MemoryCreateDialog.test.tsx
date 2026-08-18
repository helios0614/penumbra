import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MEMORY_IMPORTANCE,
  DEFAULT_MEMORY_TYPE,
  normalizeMemoryKeywordText,
} from "@/components/memory/MemoryCreateDialog";
import { MemoryView } from "@/components/memory/MemoryView";
import {
  MEMORY_TYPE_LABELS,
  MEMORY_TYPE_OPTIONS,
} from "@/components/memory/memory-presentation";
import { Slider } from "@/components/ui/slider";

const dialogSource = readFileSync(
  new URL("./MemoryCreateDialog.tsx", import.meta.url),
  "utf8",
);
const memoryViewSource = readFileSync(
  new URL("./MemoryView.tsx", import.meta.url),
  "utf8",
);
const sliderSource = readFileSync(
  new URL("../ui/slider.tsx", import.meta.url),
  "utf8",
);
const dialogPrimitiveSource = readFileSync(
  new URL("../ui/dialog.tsx", import.meta.url),
  "utf8",
);
const memoryServiceSource = readFileSync(
  new URL("../../application/memory-list/memory-list-service.ts", import.meta.url),
  "utf8",
);

describe("memory create presentation", () => {
  it("adds the Memory-only Plus before Close with the shared header action recipe", () => {
    const html = renderToStaticMarkup(<MemoryView onBack={vi.fn()} />);
    const addButton = html.match(
      /<button[^>]*data-slot="page-header-action"[^>]*aria-label="新增记忆"[^>]*>/,
    )?.[0];
    const closeButton = html.match(
      /<button[^>]*data-slot="page-header-action"[^>]*aria-label="返回桌面"[^>]*>/,
    )?.[0];

    expect(addButton).toContain('title="新增记忆"');
    expect(addButton).toContain("size-11");
    expect(addButton).toContain("before:inset-1");
    expect(closeButton).toContain("size-11");
    expect(html).toContain("lucide-plus");
    expect(html.indexOf('aria-label="新增记忆"')).toBeLessThan(
      html.indexOf('aria-label="返回桌面"'),
    );
    expect(memoryViewSource).toContain("setCreateDialogOpen(true)");
    expect(memoryViewSource).toContain("open={createDialogOpen}");
  });

  it("uses the existing compact Dialog composition and decorative font", () => {
    expect(dialogPrimitiveSource).toContain("mist-glass-strong");
    expect(dialogSource).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialogSource).toContain("sm:max-w-lg");
    expect(dialogSource).toContain("overflow-y-auto");
    expect(dialogSource).toContain("rounded-[28px]");
    expect(dialogSource).toMatch(/font-decorative[\s\S]*?ADD MEMORY/);
    expect(dialogSource).toContain("新增记忆");
    expect(dialogSource).toContain("留下一段值得记住的内容。");
    expect(dialogSource).not.toMatch(/font-family|--font-decorative/);
  });

  it("keeps content visually primary without required stars and validates trimmed text", () => {
    expect(dialogSource).toContain('htmlFor="memory-create-content"');
    expect(dialogSource).toContain("写下这段记忆……");
    expect(dialogSource).toContain("rows={5}");
    expect(dialogSource).toContain("min-h-28");
    expect(dialogSource).toContain("max-h-44");
    expect(dialogSource).toContain("autoFocus");
    expect(dialogSource).toContain("initialFocus={contentRef}");
    expect(dialogSource).toContain("content.trim()");
    expect(dialogSource).toContain("写下一点内容再保存。");
    expect(dialogSource).toContain("disabled={isCreating || !content.trim()}");
    expect(dialogSource).not.toMatch(/required(?:=|\s)/);
    expect(dialogSource).not.toMatch(/内容\s*(?:\*|＊)|必填|\(required\)/);
  });

  it("uses the accessible Base UI slider at the required defaults and range", () => {
    expect(DEFAULT_MEMORY_IMPORTANCE).toBe(0.5);
    expect(dialogSource).toContain("min={0}");
    expect(dialogSource).toContain("max={1}");
    expect(dialogSource).toContain("step={0.1}");
    expect(dialogSource).toContain('ariaLabel="重要性"');
    expect(dialogSource).toContain("importance.toFixed(1)");
    expect(sliderSource).toContain('@base-ui/react/slider');
    expect(sliderSource).toContain("getAriaLabel");
    expect(sliderSource).toContain("input:focus-visible");

    const html = renderToStaticMarkup(
      <Slider
        value={0.5}
        onValueChange={vi.fn()}
        min={0}
        max={1}
        step={0.1}
        ariaLabel="重要性"
      />,
    );
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-label="重要性"');
    expect(html).toContain('aria-valuenow="0.5"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="1"');
    expect(html).toContain('step="0.1"');
  });

  it("reuses the single known type mapping and defaults to event", () => {
    expect(DEFAULT_MEMORY_TYPE).toBe("event");
    expect(MEMORY_TYPE_OPTIONS).toEqual(
      Object.entries(MEMORY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    );
    expect(MEMORY_TYPE_OPTIONS).toEqual([
      { value: "shared_moment", label: "共同经历" },
      { value: "emotion", label: "情感时刻" },
      { value: "life_event", label: "重要事件" },
      { value: "preference", label: "喜好 / 雷区" },
      { value: "promise", label: "约定承诺" },
      { value: "milestone", label: "关系里程碑" },
      { value: "event", label: "事件" },
      { value: "digest", label: "总结" },
    ]);
    expect(dialogSource).toContain("<AppSelect");
    expect(dialogSource).toContain("options={MEMORY_TYPE_OPTIONS}");
    expect(dialogSource).not.toMatch(/<input[^>]*type=["']text["'][^>]*name=["']type/);
  });

  it("normalizes Chinese and English comma keywords while preserving case and order", () => {
    expect(normalizeMemoryKeywordText("七夕, 论坛，照片帖, Monitor, 七夕"))
      .toEqual(["七夕", "论坛", "照片帖", "Monitor"]);
    expect(normalizeMemoryKeywordText(" ，, ")).toEqual([]);
    expect(dialogSource).toContain("输入关键词，用逗号分隔");
  });

  it("keeps pending, inline errors, close guards, and keyboard semantics local", () => {
    expect(dialogSource).toContain("disablePointerDismissal={isCreating}");
    expect(dialogSource).toContain("if (!nextOpen && isCreating) return");
    expect(dialogSource).toContain("disabled={isCreating}");
    expect(dialogSource).toContain("保存中…");
    expect(dialogSource).toContain('role="alert"');
    expect(dialogSource).toContain('data-memory-create-error={createError.code}');
    expect(memoryServiceSource).toContain("保存结果暂时无法确认");
    expect(dialogSource).toContain('aria-label="关闭新增记忆"');
    expect(dialogSource).toContain('title="关闭新增记忆"');
    expect(dialogSource).toContain('aria-describedby={contentInvalid ? "memory-create-content-error"');
    expect(dialogSource).toContain("<DialogClose");
    expect(dialogSource).not.toMatch(/alert\(|toast|Edit|Delete|编辑|删除/);
  });
});
