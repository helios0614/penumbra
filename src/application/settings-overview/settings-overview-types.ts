import type {
  ChatReadiness,
  SessionState,
} from "@/domain/runtime";

export type SettingsOverview = {
  readonly session: SessionState;
  readonly readiness: ChatReadiness;
};
