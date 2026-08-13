import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MemoryFilters } from "@/components/memory/MemoryFilters";
import { MemoryItem } from "@/components/memory/MemoryItem";
import {
  MemoryListEmpty,
  MemoryListError,
  MemoryListLoading,
} from "@/components/memory/MemoryListStates";
import { presentMemoryItem } from "@/components/memory/memory-presentation";
import type { Memory } from "@/domain/memory";

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
    expect(html).toContain("搜索记忆");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("按重要度筛选");
    expect(html).toContain('data-slot="select-trigger"');
    expect(html).not.toContain("<select");
    expect(html).toContain("钉住的在前");
    expect(html).not.toMatch(/[📌🔍🧠✏️🗑️🔄📜]/u);
    expect(html).not.toMatch(/类型筛选|仅看钉住/);
  });
});

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
