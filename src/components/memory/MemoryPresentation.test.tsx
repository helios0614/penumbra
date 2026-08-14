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

describe("memory presentation", () => {
  it("presents real text, known and unknown type, importance, tags, and timestamp", () => {
    const known = presentMemoryItem(memory());
    const unknown = presentMemoryItem(memory({ type: "future_type" }));

    expect(known).toMatchObject({
      typeLabel: "共同经历",
      importanceLabel: "重要度 0.8",
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
    expect(html).toContain("重要度 0.8");
    expect(html).toContain("海边");
    expect(html).toContain('data-memory-pin="true"');
    expect(html).toContain('aria-label="这条记忆仍有未完成事件"');
    expect(html).not.toMatch(/待跟进|未完成<|需要处理|标记待办|📌/);
    expect(html).not.toMatch(/编辑|删除|重新总结|pin\/unpin/);
    expect(html).not.toContain("<form");
  });

  it("does not render pin or mutation affordances for an unpinned memory", () => {
    const html = renderToStaticMarkup(
      <MemoryItem memory={memory({ isPinned: false })} />,
    );
    expect(html).not.toContain("data-memory-pin");
    expect(html).not.toMatch(/编辑|删除|添加记忆|重新生成|总结/);
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
    expect(html).toContain("钉住的在前");
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

  it("renders a fixed reading header, an independent list scroll region, and pagination footer", () => {
    const html = renderReadingPanel(memoryPage());
    const panel = html.match(/<section[^>]*data-memory-reading-panel="true"[^>]*>/)?.[0];
    const readingHeader = html.match(/<header[^>]*data-memory-reading-header="true"[^>]*>/)?.[0];
    const scrollRegion = html.match(/<div[^>]*data-memory-list-scroll="true"[^>]*>/)?.[0];
    const paginationFooter = html.match(/<footer[^>]*data-memory-pagination-footer="true"[^>]*>/)?.[0];

    expect(panel).toContain("mist-solid");
    expect(panel).toContain("min-h-0");
    expect(panel).toContain("flex-1");
    expect(readingHeader).toContain("shrink-0");
    expect(html).toContain("Memory");
    expect(html).toContain('data-memory-total="true">4570</span>');
    expect(html).not.toContain("共 4570 条");
    expect(scrollRegion).toContain("min-h-0");
    expect(scrollRegion).toContain("flex-1");
    expect(scrollRegion).toContain("overflow-y-auto");
    expect(paginationFooter).toContain("shrink-0");
    expect(html.indexOf('data-memory-reading-header="true"')).toBeLessThan(
      html.indexOf('data-memory-list-scroll="true"'),
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
      expect(html).toContain("Memory");
    }
    expect(loading).toContain("正在加载记忆");
    expect(empty).toContain("还没有留下记忆");
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

    expect(firstPage).toContain("第 1 / 153 页");
    expect(firstPage).toMatch(/<button[^>]*disabled=""[^>]*aria-label="上一页"/);
    expect(firstPage).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="下一页"/);
    expect(lastPage).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="上一页"/);
    expect(lastPage).toMatch(/<button[^>]*disabled=""[^>]*aria-label="下一页"/);
    expect(firstPage.match(/class="[^"]*size-11[^"]*"/g)).toHaveLength(2);
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
