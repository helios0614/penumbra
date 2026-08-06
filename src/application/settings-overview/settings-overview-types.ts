import type {
  AvailableModel,
  ChatReadiness,
  SessionState,
} from "@/domain/runtime";

export type SettingsOverview = {
  readonly session: SessionState;
  readonly models: readonly AvailableModel[];
  readonly readiness: ChatReadiness;
};
