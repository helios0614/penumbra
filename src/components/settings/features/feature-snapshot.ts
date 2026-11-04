import { listConnections, listFeatureBindings } from "@/domain/registry/registry-client";
import type { FeatureBinding } from "@/domain/registry/feature-bindings";
import type { ConnectionList } from "@/domain/registry/registry-types";

export interface FeatureSnapshot { readonly registry: ConnectionList; readonly features: readonly FeatureBinding[] }
export async function readFeatureSnapshot(signal: AbortSignal): Promise<FeatureSnapshot> {
  const [registry, features] = await Promise.all([listConnections({ signal }), listFeatureBindings({ signal })]);
  return { registry, features };
}
