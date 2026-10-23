import { apiGet, type ApiRequestOptions } from "@/lib/api";
import { RuntimeContractError } from "./runtime-types";

export type MainSelection =
  | { readonly connectionId: string; readonly protocol: string; readonly model: string; readonly profileId?: never }
  | { readonly profileId: string; readonly model: string; readonly connectionId?: never; readonly protocol?: never };
export type MainConnection = {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly protocols: readonly string[];
  readonly defaultModel: string;
  readonly credentialConfigured: boolean;
};
export type MainConfiguration = {
  readonly selection: MainSelection | null;
  readonly diagnostic: string | null;
  readonly connections: readonly MainConnection[];
  readonly allowedProtocols: readonly string[];
};

export function safeDiagnostic(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,95}$/.test(value)) throw invalid();
  return value;
}

export function mapMainSelection(value: unknown): MainSelection | null {
  if (value === null || value === undefined) return null;
  if (!record(value) || !text(value.model)) throw invalid();
  if (text(value.connection_id) && text(value.protocol) && value.profile_id == null) {
    return { connectionId: value.connection_id, protocol: value.protocol, model: value.model };
  }
  if (text(value.profile_id) && value.connection_id == null && value.protocol == null) {
    return { profileId: value.profile_id, model: value.model };
  }
  throw invalid();
}

export function mainSelectionWire(selection: MainSelection): Record<string, string> {
  return selection.connectionId !== undefined
    ? { connection_id: selection.connectionId, protocol: selection.protocol, model: selection.model }
    : { profile_id: selection.profileId, model: selection.model };
}

export function mapMainConfiguration(value: unknown): MainConfiguration {
  if (!record(value) || !Array.isArray(value.connections) || !strings(value.allowed_protocols)) throw invalid();
  const allowedProtocols = [...value.allowed_protocols];
  return {
    // Canonical presence (even null) takes precedence over the legacy view.
    selection: mapMainSelection(Object.prototype.hasOwnProperty.call(value, "connection_selection") ? value.connection_selection : value.selection),
    diagnostic: safeDiagnostic(value.diagnostic),
    allowedProtocols,
    connections: value.connections.map((item) => {
      if (!record(item) || !text(item.id) || typeof item.name !== "string" ||
          typeof item.enabled !== "boolean" || typeof item.transport !== "string" ||
          typeof item.credential_configured !== "boolean" ||
          !(item.default_model == null || typeof item.default_model === "string")) throw invalid();
      return { id: item.id, name: item.name, enabled: item.enabled,
        protocols: allowedProtocols.filter((protocol) => item.transport === "direct" ||
          (["cloudflare_rest", "cloudflare_anthropic"].includes(item.transport as string) && protocol === "anthropic_messages")),
        defaultModel: item.default_model ?? "",
        credentialConfigured: item.credential_configured };
    }),
  };
}

/** Undefined means the global new-conversation default, never a selected conversation. */
export async function getMainConfiguration(conversationId?: string, options?: ApiRequestOptions): Promise<MainConfiguration> {
  return mapMainConfiguration(await apiGet("/api/main/configuration", {
    ...options, cache: "no-store", query: { conv_id: conversationId },
  }));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text); }
function invalid() { return new RuntimeContractError("Backend response does not match the Main configuration contract"); }
