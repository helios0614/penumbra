import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

import type { Memory } from "@/domain/memory";

const MEMORY_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  shared_moment: "共同经历",
  emotion: "情感时刻",
  life_event: "重要事件",
  preference: "喜好 / 雷区",
  promise: "约定承诺",
  milestone: "关系里程碑",
  event: "事件",
  digest: "总结",
});

export type MemoryItemPresentation = {
  readonly typeLabel: string | null;
  readonly importanceLabel: string | null;
  readonly timeLabel: string;
  readonly visibleTags: readonly string[];
  readonly hiddenTagCount: number;
};

export function presentMemoryItem(memory: Memory): MemoryItemPresentation {
  const visibleTags = memory.tags.slice(0, 8);
  return {
    typeLabel: memory.type ? MEMORY_TYPE_LABELS[memory.type] ?? memory.type : null,
    importanceLabel:
      memory.importance === null ? null : `重要度 ${memory.importance.toFixed(1)}`,
    timeLabel: format(new Date(memory.createdAt * 1_000), "yyyy年M月d日 HH:mm", {
      locale: zhCN,
    }),
    visibleTags,
    hiddenTagCount: memory.tags.length - visibleTags.length,
  };
}
