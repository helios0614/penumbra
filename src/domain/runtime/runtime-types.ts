export type SessionState =
  | { status: "authenticated" }
  | { status: "unauthenticated" };

export type AvailableModel = {
  key: string;
  label: string;
  provider: string;
};

export type ChatReadinessReason =
  | "ready"
  | "unknown-model"
  | "provider-not-configured"
  | "configuration-invalid";

export type ChatReadiness = {
  ready: boolean;
  modelKey: string;
  reason: ChatReadinessReason;
  setupActionRequired: boolean;
  readonly generationUnsupported?: true;
};

export class RuntimeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeContractError";
  }
}
