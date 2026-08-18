import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

import type { Memory } from "@/domain/memory";

export const MEMORY_TYPE_LABELS = Object.freeze({
  shared_moment: "共同经历",
  emotion: "情感时刻",
  life_event: "重要事件",
  preference: "喜好 / 雷区",
  promise: "约定承诺",
  milestone: "关系里程碑",
  event: "事件",
  digest: "总结",
});

export type KnownMemoryType = keyof typeof MEMORY_TYPE_LABELS;

export const MEMORY_TYPE_OPTIONS: ReadonlyArray<{
  readonly value: KnownMemoryType;
  readonly label: string;
}> = Object.freeze(
  Object.entries(MEMORY_TYPE_LABELS).map(([value, label]) => ({
    value: value as KnownMemoryType,
    label,
  })),
);

export type MemoryItemPresentation = {
  readonly typeLabel: string | null;
  readonly importanceLabel: string | null;
  readonly importanceValue: string | null;
  readonly timeLabel: string;
  readonly visibleTags: readonly string[];
  readonly hiddenTagCount: number;
};

export function presentMemoryItem(memory: Memory): MemoryItemPresentation {
  const visibleTags = memory.tags.slice(0, 8);
  return {
    typeLabel: memory.type
      ? memory.type in MEMORY_TYPE_LABELS
        ? MEMORY_TYPE_LABELS[memory.type as KnownMemoryType]
        : memory.type
      : null,
    importanceLabel: memory.importance === null ? null : "重要度",
    importanceValue: memory.importance === null ? null : memory.importance.toFixed(1),
    timeLabel: format(new Date(memory.createdAt * 1_000), "yyyy年M月d日 HH:mm", {
      locale: zhCN,
    }),
    visibleTags,
    hiddenTagCount: memory.tags.length - visibleTags.length,
  };
}
