import { readFileSync } from "node:fs";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MemoryFilters } from "@/components/memory/MemoryFilters";
import { MemoryItem } from "@/components/memory/MemoryItem";
import {
  MemoryReadingPanel,
  MemoryView,
  resetMemoryListScrollPosition,
} from "@/components/memory/MemoryView";
import {
  MemoryListEmpty,
  MemoryListError,
  MemoryListLoading,
} from "@/components/memory/MemoryListStates";
import { presentMemoryItem } from "@/components/memory/memory-presentation";
import type { Memory, MemoryPage } from "@/domain/memory";

const memoryViewSource = readFileSync(
  new URL("./MemoryView.tsx", import.meta.url),
  "utf8",
);
const memoryFiltersSource = readFileSync(
  new URL("./MemoryFilters.tsx", import.meta.url),
  "utf8",
);
const memoryItemSource = readFileSync(
  new URL("./MemoryItem.tsx", import.meta.url),
  "utf8",
);
const indexCssSource = readFileSync(
  new URL("../../index.css", import.meta.url),
  "utf8",
);

describe("memory presentation", () => {
  it("presents real text, known and unknown type, importance, tags, and timestamp", () => {
    const known = presentMemoryItem(memory());
    const unknown = presentMemoryItem(memory({ type: "future_type" }));

    expect(known).toMatchObject({
      typeLabel: "共同经历",
      importanceLabel: "重要度",
      importanceValue: "0.8",
      visibleTags: ["海边", "电影"],
      hiddenTagCount: 0,
    });
    expect(known.timeLabel).toMatch(/年.*月.*日/);
    expect(unknown.typeLabel).toBe("future_type");
  });

  it("renders a read-only linear pin icon with accessible meaning and no pin status text", () => {
    const html = renderToStaticMarkup(<MemoryItem memory={memory()} />);

    expect(html).toContain("一段真实记忆");
    expect(html).toContain("共同经历");
    expect(html).toMatch(/重要度<\/span> <span[^>]*>0\.8<\/span>/);
    expect(html).toContain("海边");
    expect(html).toContain('data-memory-pin="true"');
    expect(html).toContain('aria-label="这条记忆仍有未完成事件"');
    expect(html).not.toMatch(/待跟进|未完成<|需要处理|标记待办|📌/);
    expect(html).not.toMatch(/编辑|删除|重新总结|pin\/unpin/);
    expect(html).not.toContain("<form");
  });

  it("uses softer reading typography and a restrained metadata hierarchy", () => {
    const html = renderToStaticMarkup(<MemoryItem memory={memory()} />);
    const unpinnedHtml = renderToStaticMarkup(
      <MemoryItem memory={memory({ isPinned: false })} />,
    );
    const item = html.match(/<article[^>]*data-memory-item="true"[^>]*>/)?.[0];
    const header = html.match(
      /<div[^>]*data-memory-item-header="true"[^>]*>/,
    )?.[0];
    const metadata = html.match(
      /<div[^>]*data-memory-item-metadata="true"[^>]*>/,
    )?.[0];
    const actions = html.match(
      /<div[^>]*data-memory-item-actions="true"[^>]*>/,
    )?.[0];
    const body = html.match(/<p[^>]*data-memory-body="true"[^>]*>/)?.[0];
    const unpinnedBody = unpinnedHtml.match(
      /<p[^>]*data-memory-body="true"[^>]*>/,
    )?.[0];
    const pin = html.match(/<span[^>]*data-memory-pin="true"[^>]*>/)?.[0];
    const type = html.match(/<span[^>]*data-memory-type="true"[^>]*>/)?.[0];
    const importanceLabel = html.match(
      /<span[^>]*data-memory-importance-label="true"[^>]*>/,
    )?.[0];
    const importanceValue = html.match(
      /<span[^>]*data-memory-importance-value="true"[^>]*>/,
    )?.[0];
    const itemFooter = html.match(/<footer[^>]*>/)?.[0];

    expect(item).toContain("relative");
    expect(item).toContain("py-3.5");
    expect(header).toContain("pr-14");
    expect(header).not.toMatch(/\b(?:flex|items-start|justify-between|h-11|min-h-11)\b/);
    expect(metadata).toContain("min-w-0");
    expect(metadata).not.toContain("flex-1");
    expect(actions).toContain("absolute");
    expect(actions).toContain("right-2");
    expect(actions).toContain("top-0");
    expect(actions).toContain("sm:right-4");
    expect(actions).not.toContain("role=");
    expect(actions).not.toContain("tabindex=");
    expect(pin).toContain("size-11");
    expect(pin).not.toContain("size-7");
    expect(body).toContain("text-sm");
    expect(body).toContain("sm:text-[15px]");
    expect(body).toContain("mt-1.5");
    expect(unpinnedBody).toContain("mt-1.5");
    expect(body).not.toContain("pr-10");
    expect(unpinnedBody).not.toContain("pr-10");
    expect(body).toContain("leading-7");
    expect(body).toContain(
      "text-[color-mix(in_srgb,var(--color-foreground)_70%,var(--color-muted-strong))]",
    );
    expect(body).not.toContain("text-muted-foreground");
    expect(type).toContain("text-primary-ink");
    expect(type).not.toMatch(/\b(?:bg-|rounded-|border-)\S*/);
    expect(importanceLabel).toContain("text-muted-foreground");
    expect(importanceLabel).not.toContain("text-primary");
    expect(importanceValue).toContain("text-muted-strong");
    expect(importanceValue).not.toContain("text-primary");
    expect(html).toMatch(/重要度<\/span> <span[^>]*>0\.8<\/span>/);
    expect(itemFooter).toContain("mt-2");
    expect(itemFooter).toContain("gap-1");
    expect(itemFooter).toContain("sm:gap-4");
    expect(html).toContain('aria-label="记忆标签"');
    expect(html).toContain("2024年7月3日 17:46");
    expect(html.indexOf('data-memory-item-metadata="true"')).toBeLessThan(
      html.indexOf('data-memory-item-actions="true"'),
    );
    expect(html.indexOf('data-memory-item-actions="true"')).toBeLessThan(
      html.indexOf('data-memory-body="true"'),
    );
  });

  it("does not render pin or mutation affordances for an unpinned memory", () => {
    const html = renderToStaticMarkup(
      <MemoryItem memory={memory({ isPinned: false })} />,
    );
    const actions = html.match(
      /<div[^>]*data-memory-item-actions="true"[^>]*><\/div>/,
    )?.[0];

    expect(actions).toBeDefined();
    expect(html).not.toContain("data-memory-pin");
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/编辑|删除|更多|添加记忆|重新生成|总结/);
    expect(memoryItemSource).not.toMatch(/onPin|togglePin|deleteMemory|editMemory/);
  });

  it("renders loading, empty, filtered empty, and safe error states", () => {
    const loading = renderToStaticMarkup(<MemoryListLoading />);
    const empty = renderToStaticMarkup(<MemoryListEmpty filtered={false} />);
    const filtered = renderToStaticMarkup(<MemoryListEmpty filtered />);
    const error = renderToStaticMarkup(
      <MemoryListError
        error={{ code: "network", message: "暂时无法连接到记忆库。" }}
        onRetry={vi.fn()}
      />,
    );

    expect(loading).toContain("正在加载记忆");
    expect(loading).toContain('aria-busy="true"');
    expect(empty).toContain("还没有留下记忆");
    expect(filtered).toContain("没有找到相符的记忆");
    expect(error).toContain("无法加载记忆");
    expect(error).toContain("重试");
    expect(error).not.toMatch(/endpoint|stack|response/);
  });

  it("renders accessible server filters without emoji controls or unsupported filters", () => {
    const html = renderToStaticMarkup(
      <MemoryFilters
        searchInput=""
        date="all"
        importance="all"
        pinFirst={false}
        loading={false}
        onSearchChange={vi.fn()}
        onDateChange={vi.fn()}
        onImportanceChange={vi.fn()}
        onPinFirstChange={vi.fn()}
      />,
    );

    expect(html).toContain('type="search"');
    expect(html).toContain('data-memory-filter-surface="true"');
    expect(html).toContain("mist-glass");
    expect(html.match(/data-surface="translucent"/g)).toHaveLength(2);
    expect(html).not.toContain("mist-solid");
    expect(html).toContain("搜索记忆");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("按重要度筛选");
    expect(html).toContain('data-slot="select-trigger"');
    expect(html).toContain("全部重要度");
    expect(html).not.toContain("<select");
    expect(html).toContain("钉选优先");
    expect(html).not.toContain("钉住的在前");
    const filterSurface = html.match(
      /<section[^>]*data-memory-filter-surface="true"[^>]*>/,
    )?.[0];
    const searchInput = html.match(/<input[^>]*type="search"[^>]*>/)?.[0];
    const selectTrigger = html.match(
      /<button[^>]*data-slot="select-trigger"[^>]*>/,
    )?.[0];
    const primaryRow = html.match(
      /<div[^>]*data-memory-filter-row="search-importance"[^>]*>/,
    )?.[0];
    const secondaryRow = html.match(
      /<div[^>]*data-memory-filter-row="time-pin"[^>]*>/,
    )?.[0];
    const timeFilters = html.match(
      /<div[^>]*data-memory-time-filters="true"[^>]*>/,
    )?.[0];
    const searchWrapper = html.match(
      /<label[^>]*data-memory-search-filter="true"[^>]*>/,
    )?.[0];
    const dateButtons = Array.from(
      html.matchAll(/<button[^>]*data-memory-date-filter="[^"]+"[^>]*>/g),
      (match) => match[0],
    );
    const pinFirstButton = html.match(
      /<button[^>]*data-memory-pin-first-filter="true"[^>]*>/,
    )?.[0];
    const populatedHtml = renderToStaticMarkup(
      <MemoryFilters
        searchInput="片段"
        date="all"
        importance="all"
        pinFirst={false}
        loading={false}
        onSearchChange={vi.fn()}
        onDateChange={vi.fn()}
        onImportanceChange={vi.fn()}
        onPinFirstChange={vi.fn()}
      />,
    );
    const clearButton = populatedHtml.match(
      /<button[^>]*aria-label="清空搜索"[^>]*>/,
    )?.[0];

    expect(filterSurface).toContain("gap-1.5");
    expect(filterSurface).toContain("px-3");
    expect(filterSurface).toContain("py-1.5");
    expect(filterSurface).toContain("sm:py-2");
    expect(filterSurface).not.toContain("sm:p-3");
    expect(searchInput).toContain("h-11");
    expect(searchInput).toContain("min-h-11");
    expect(searchInput).toContain("min-w-11");
    expect(searchInput).toContain("w-full");
    expect(searchInput).not.toContain("min-w-0");
    expect(searchInput).toContain("pr-4");
    expect(searchInput).toContain("py-0");
    expect(searchInput).toContain("text-xs");
    expect(searchInput).toContain("md:text-xs");
    expect(searchInput).toContain("leading-5");
    expect(searchInput).toContain("placeholder:font-normal");
    expect(searchInput).toContain("placeholder:text-muted-foreground");
    expect(searchInput).not.toMatch(/(?:class="|\s)text-sm(?:\s|")/);
    expect(searchInput).not.toContain("md:text-sm");
    expect(searchInput).toContain("shadow-none");
    expect(searchInput).toContain('placeholder="搜索被留下来的片段"');
    expect(searchInput).not.toContain("max-w-");
    expect(searchWrapper).toContain("block");
    expect(searchWrapper).toContain("min-w-11");
    expect(searchWrapper).toContain("flex-1");
    expect(selectTrigger).toContain("min-h-11");
    expect(selectTrigger).toContain("h-11");
    expect(selectTrigger).toContain("w-auto");
    expect(selectTrigger).toContain("min-w-28");
    expect(selectTrigger).toContain("text-xs");
    expect(selectTrigger).toContain("leading-5");
    expect(selectTrigger).toContain("shadow-none");
    expect(selectTrigger).not.toContain("w-full");
    expect(dateButtons).toHaveLength(4);
    for (const control of [searchInput, selectTrigger, ...dateButtons, pinFirstButton]) {
      expect(control).toContain("h-11");
      expect(control).toContain("min-h-11");
      expect(control).toMatch(/(?:min-w-11|min-w-28)/);
      expect(control).toContain("text-xs");
      expect(control).toContain("leading-5");
      expect(control).toContain("focus-visible:outline-none!");
      expect(control).toContain("focus-visible:ring-2");
      expect(control).toContain("focus-visible:ring-ring/20");
      expect(control).not.toContain("focus-visible:ring-3");
      expect(control).not.toContain("focus-visible:ring-ring/50");
    }
    expect(clearButton).toContain("size-11");
    expect(clearButton).toContain("focus-visible:outline-none!");
    expect(clearButton).toContain("focus-visible:ring-2");
    expect(html).not.toContain("shadow-sm");
    expect(primaryRow).toContain("flex");
    expect(primaryRow).toContain("min-w-0");
    expect(primaryRow).toContain('aria-label="搜索与重要度"');
    expect(secondaryRow).toContain("flex");
    expect(secondaryRow).toContain('aria-label="时间与置顶排序"');
    expect(timeFilters).toContain("min-w-0");
    expect(timeFilters).toContain("flex-1");
    expect(timeFilters).not.toContain("overflow-x-auto");
    expect(timeFilters).not.toContain("overscroll");
    expect(html).toContain('data-memory-search-filter="true"');
    expect(html).toContain('data-memory-importance-filter="true"');
    expect(html).toContain('data-memory-pin-first-filter="true"');
    expect(html).toContain("全部时间");
    expect(html).toContain("今天");
    expect(html).toContain("近 7 天");
    expect(html).toContain("近 30 天");
    expect(html.indexOf('data-memory-filter-row="search-importance"')).toBeLessThan(
      html.indexOf('data-memory-search-filter="true"'),
    );
    expect(html.indexOf('data-memory-search-filter="true"')).toBeLessThan(
      html.indexOf('data-memory-importance-filter="true"'),
    );
    expect(html.indexOf('data-memory-filter-row="time-pin"')).toBeLessThan(
      html.indexOf('data-memory-time-filters="true"'),
    );
    expect(html.indexOf('data-memory-time-filters="true"')).toBeLessThan(
      html.indexOf('data-memory-pin-first-filter="true"'),
    );
    expect(memoryFiltersSource).toContain(
      "onClick={() => onPinFirstChange(!pinFirst)}",
    );
    expect(html).not.toMatch(/[📌🔍🧠✏️🗑️🔄📜]/u);
    expect(html).not.toMatch(/类型筛选|仅看钉住/);
  });

  it("keeps the mobile gutter without duplicating the desktop app gutter", () => {
    const html = renderToStaticMarkup(<MemoryView onBack={vi.fn()} />);
    const pageShell = html.match(
      /<main[^>]*aria-labelledby="memory-page-title"[^>]*>/,
    )?.[0];
    const header = html.match(/<header[^>]*>/)?.[0];

    expect(pageShell).toBeDefined();
    expect(pageShell).toContain("px-4");
    expect(pageShell).toContain("sm:px-0");
    expect(pageShell).toContain("min-h-0");
    expect(pageShell).toContain("overflow-hidden");
    expect(pageShell).not.toContain("overflow-y-auto");
    expect(pageShell).not.toContain("sm:px-6");
    expect(header).toContain("mist-glass");
    expect(header).not.toMatch(/\b(?:isolate|overflow-hidden)\b/);
    expect(html).toContain('data-memory-filter-surface="true"');
    expect(html).not.toContain(
      "color-mix(in_srgb,var(--color-background)_10%,transparent)",
    );
  });

  it("renders a panel-level decorative total without a reading header", () => {
    const html = renderReadingPanel(memoryPage());
    const panel = html.match(/<section[^>]*data-memory-reading-panel="true"[^>]*>/)?.[0];
    const scrollRegion = html.match(/<div[^>]*data-memory-list-scroll="true"[^>]*>/)?.[0];
    const paginationFooter = html.match(/<footer[^>]*data-memory-pagination-footer="true"[^>]*>/)?.[0];
    const totalDecoration = html.match(
      /<span[^>]*data-memory-total-decoration="true"[^>]*>/,
    )?.[0];
    const totalAnnouncement = html.match(
      /<span[^>]*data-memory-total-announcement="true"[^>]*>/,
    )?.[0];

    expect(panel).toContain("mist-glass-strong");
    expect(panel).not.toContain("mist-solid");
    expect(panel).toContain("relative");
    expect(panel).toContain("min-h-0");
    expect(panel).toContain("flex-1");
    expect(html).not.toContain("data-memory-reading-header");
    expect(html).not.toContain("memory-reading-title");
    expect(html).not.toContain(">Memory<");
    expect(totalDecoration).toContain("pointer-events-none");
    expect(totalDecoration).toContain("absolute");
    expect(totalDecoration).toContain("right-4");
    expect(totalDecoration).toContain("top-3");
    expect(totalDecoration).toContain("text-[15px]");
    expect(totalDecoration).not.toContain("text-base");
    expect(totalDecoration).toContain("memory-total-decoration");
    expect(totalDecoration).not.toMatch(/\b(?:font-heading|text-muted-foreground)\b/);
    expect(totalDecoration).toContain('aria-hidden="true"');
    expect(html).toContain('data-memory-total-decoration="true">4570</span>');
    expect(totalAnnouncement).toContain("sr-only");
    expect(totalAnnouncement).toContain('aria-live="polite"');
    expect(html).toContain("共 4570 条记忆</span>");
    expect(indexCssSource).toMatch(
      /@font-face\s*\{[^}]*font-family: "LXGW WenKai Screen";[^}]*LXGWWenKaiScreen\.ttf[^}]*font-display: swap;[^}]*\}/,
    );
    const totalDecorationStyles = indexCssSource.match(
      /\.memory-total-decoration\s*\{[^}]*\}/,
    )?.[0];
    expect(totalDecorationStyles).toContain(
      'font-family: "LXGW WenKai Screen", "Noto Serif SC", serif;',
    );
    expect(totalDecorationStyles).toContain("font-style: oblique 6deg;");
    expect(totalDecorationStyles).toContain("font-weight: 400;");
    expect(totalDecorationStyles).toContain("letter-spacing: 0.08em;");
    expect(totalDecorationStyles).toContain("line-height: 1;");
    expect(totalDecorationStyles).toContain("opacity: 0.64;");
    expect(totalDecorationStyles).toContain(
      "color: color-mix(in srgb, var(--color-theme) 14%, var(--color-muted-foreground));",
    );
    expect(
      memoryViewSource.match(/className="memory-total-decoration\b/g),
    ).toHaveLength(1);
    expect(scrollRegion).toContain("min-h-0");
    expect(scrollRegion).toContain("flex-1");
    expect(scrollRegion).toContain("overflow-y-auto");
    expect(scrollRegion).toContain("pt-7");
    expect(paginationFooter).toContain("shrink-0");
    expect(html.indexOf('data-memory-total-decoration="true"')).toBeLessThan(
      html.indexOf('data-memory-list-scroll="true"'),
    );
    expect(html.indexOf('data-memory-list-scroll="true"')).toBeLessThan(
      html.indexOf("data-memory-item"),
    );
    expect(html.indexOf('data-memory-list-scroll="true"')).toBeLessThan(
      html.indexOf('data-memory-pagination-footer="true"'),
    );
    expect(memoryViewSource).toMatch(
      /data-memory-list-scroll="true"[\s\S]*?<\/div>\s*\{data && data\.total > 0 && \(\s*<footer/,
    );
  });

  it("keeps loading, empty, and error states inside the reading panel scroll region", () => {
    const loading = renderReadingPanel(null, { isLoading: true });
    const empty = renderReadingPanel(memoryPage({ items: [], total: 0, hasMore: false }));
    const error = renderReadingPanel(null, {
      error: { code: "network", message: "暂时无法连接到记忆库。" },
    });

    for (const html of [loading, empty, error]) {
      expect(html).toContain('data-memory-reading-panel="true"');
      expect(html).toContain('data-memory-list-scroll="true"');
      expect(html).not.toContain("data-memory-reading-header");
    }
    expect(loading).toContain("正在加载记忆");
    expect(empty).toContain("还没有留下记忆");
    expect(empty).toContain('data-memory-total-decoration="true"');
    expect(empty).toContain('data-memory-total-announcement="true"');
    expect(error).toContain("无法加载记忆");
    expect(loading).not.toContain("data-memory-pagination-footer");
    expect(empty).not.toContain("data-memory-pagination-footer");
    expect(error).not.toContain("data-memory-pagination-footer");
  });

  it("keeps real pagination boundaries and 44px icon targets", () => {
    const firstPage = renderReadingPanel(memoryPage());
    const lastPage = renderReadingPanel(memoryPage({
      page: 153,
      hasMore: false,
    }));
    const paginationButtons = Array.from(
      firstPage.matchAll(
        /<button[^>]*aria-label="(?:上一页|下一页)"[^>]*>/g,
      ),
      (match) => match[0],
    );

    expect(firstPage).toContain("第 1 / 153 页");
    expect(firstPage).toMatch(/<button[^>]*disabled=""[^>]*aria-label="上一页"/);
    expect(firstPage).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="下一页"/);
    expect(lastPage).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="上一页"/);
    expect(lastPage).toMatch(/<button[^>]*disabled=""[^>]*aria-label="下一页"/);
    expect(paginationButtons).toHaveLength(2);
    for (const button of paginationButtons) expect(button).toContain("size-11");
    const paginationFooter = firstPage.match(
      /<footer[^>]*data-memory-pagination-footer="true"[^>]*>/,
    )?.[0];
    const paginationLabel = firstPage.match(
      /<span[^>]*data-memory-pagination-label="true"[^>]*>/,
    )?.[0];

    expect(paginationFooter).toContain("py-0.5");
    expect(paginationFooter).not.toContain("py-2");
    expect(paginationLabel).toContain("text-[11px]");
    expect(paginationLabel).toContain("font-normal");
    expect(paginationLabel).toContain("leading-none");
    expect(paginationLabel).toContain("text-muted-foreground");
  });

  it("resets only the reading list scroll position for a delivered page", () => {
    const scrollRegion = { scrollTop: 480 };

    resetMemoryListScrollPosition(scrollRegion);

    expect(scrollRegion.scrollTop).toBe(0);
    expect(memoryViewSource).not.toMatch(/window\.scroll|scrollTo\(/);
  });
});

function renderReadingPanel(
  data: MemoryPage | null,
  overrides: {
    readonly isLoading?: boolean;
    readonly error?: { readonly code: "network"; readonly message: string } | null;
  } = {},
) {
  return renderToStaticMarkup(
    <MemoryReadingPanel
      data={data}
      isLoading={overrides.isLoading ?? false}
      error={overrides.error ?? null}
      hasFilters={false}
      listScrollRef={createRef<HTMLDivElement>()}
      onRetry={vi.fn()}
      onPageChange={vi.fn()}
    />,
  );
}

function memoryPage(overrides: Partial<MemoryPage> = {}): MemoryPage {
  return {
    items: [memory()],
    page: 1,
    pageSize: 30,
    total: 4570,
    totalAll: 4570,
    hasMore: true,
    ...overrides,
  };
}

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_1",
    content: "一段真实记忆",
    type: "shared_moment",
    createdAt: 1_720_000_000,
    sourceConversationId: "conv_1",
    tags: ["海边", "电影"],
    importance: 0.8,
    sourceStartedAt: 1_719_999_900,
    sourceEndedAt: 1_720_000_000,
    isPinned: true,
    ...overrides,
  };
}
