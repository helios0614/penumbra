import type { Memory, MemoryDigestResult, MemoryRequeueTask, MemorySourceCapability } from "@/domain/memory";
export type MemoryActionKind = "edit" | "delete" | "resummarize" | "requeue";
export type MemoryAction = { readonly kind: MemoryActionKind; readonly memory: Memory };
export type MemoryManagementError = { readonly code: string; readonly message: string; readonly uncertain: boolean };
export type MemorySourceRead =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: MemorySourceCapability }
  | { readonly status: "error"; readonly error: MemoryManagementError };
export type MemoryTaskView = { readonly task: MemoryRequeueTask; readonly reading: boolean; readonly error: MemoryManagementError | null };
export type MemoryManagementState = {
  readonly action: MemoryAction | null;
  readonly actionPending: boolean;
  readonly actionError: MemoryManagementError | null;
  readonly sources: Readonly<Record<string, MemorySourceRead>>;
  readonly digestPending: boolean;
  readonly digestResult: MemoryDigestResult | null;
  readonly digestError: MemoryManagementError | null;
  readonly tasks: readonly MemoryTaskView[];
};
export const INITIAL_MEMORY_MANAGEMENT_STATE: MemoryManagementState = {
  action: null, actionPending: false, actionError: null, sources: {},
  digestPending: false, digestResult: null, digestError: null, tasks: [],
};
