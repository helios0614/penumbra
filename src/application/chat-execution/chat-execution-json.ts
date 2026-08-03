import type { JsonValue } from "@/domain/message";

import { ChatExecutionContractError } from "@/application/chat-execution/chat-execution-types";

export type OwnData =
  | { readonly present: false }
  | { readonly present: true; readonly value: unknown };

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function readOwnData(
  record: Record<string, unknown>,
  key: string,
): OwnData {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) {
    return { present: false };
  }
  if (!("value" in descriptor)) {
    throw unsafeJsonError();
  }
  return { present: true, value: descriptor.value };
}

export function cloneJsonObject(value: unknown): Record<string, JsonValue> {
  if (!isPlainRecord(value)) {
    throw unsafeJsonError();
  }
  return cloneJsonRecord(value, new WeakSet<object>());
}

export function cloneJsonArray(value: unknown): JsonValue[] {
  if (!Array.isArray(value)) {
    throw unsafeJsonError();
  }
  return cloneJsonArrayValue(value, new WeakSet<object>());
}

function cloneJsonValue(
  value: unknown,
  ancestors: WeakSet<object>,
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "object") {
    throw unsafeJsonError();
  }

  if (ancestors.has(value)) {
    throw unsafeJsonError();
  }

  if (Array.isArray(value)) {
    return cloneJsonArrayValue(value, ancestors);
  }

  if (!isPlainRecord(value)) {
    throw unsafeJsonError();
  }

  return cloneJsonRecord(value, ancestors);
}

function cloneJsonArrayValue(
  value: readonly unknown[],
  ancestors: WeakSet<object>,
): JsonValue[] {
  ancestors.add(value);
  try {
    const copy: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) {
        throw unsafeJsonError();
      }
      copy.push(cloneJsonValue(descriptor.value, ancestors));
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function cloneJsonRecord(
  value: Record<string, unknown>,
  ancestors: WeakSet<object>,
): Record<string, JsonValue> {
  ancestors.add(value);
  try {
    const copy: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        throw unsafeJsonError();
      }
      Object.defineProperty(copy, key, {
        value: cloneJsonValue(descriptor.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function unsafeJsonError(): ChatExecutionContractError {
  return new ChatExecutionContractError(
    "Chat execution JSON data is not safely serializable",
  );
}
