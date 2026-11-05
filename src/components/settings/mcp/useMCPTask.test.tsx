import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hookSession } from "@/components/chat/test-utils/hook-session";
import { MCPError } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe("MCP task request isolation", () => {
  it("ignores earlier successes after a later request on the same Server/request", async () => {
    const hooks = hookSession(() => useMCPTask<string>());
    const first = deferred<string>(), second = deferred<string>();
    let signal!: AbortSignal;
    const task = hooks.render(); hooks.commit();
    const old = task.run(value => { signal = value; return first.promise; });
    const latest = task.run(() => second.promise);
    second.resolve("current"); expect(await latest).toBe("current");
    first.resolve("stale"); expect(await old).toBeUndefined();
    expect(signal.aborted).toBe(true); expect(hooks.render().state.data).toBe("current"); hooks.dispose();
  });
  it("clears a revealed secret and discards late reveal when display closes", async () => {
    const hooks = hookSession(() => useMCPTask<string>());
    const pending = deferred<string>(); const task = hooks.render(); hooks.commit();
    const reveal = task.run(() => pending.promise); task.reset();
    pending.resolve("synthetic-key-must-not-reappear"); expect(await reveal).toBeUndefined();
    expect(hooks.render().state.data).toBeNull(); hooks.dispose();
  });
  it("ignores late failures after switching Server and after unmount", async () => {
    const hooks = hookSession(() => useMCPTask<string>());
    const pending = deferred<string>(); const task = hooks.render(); hooks.commit();
    const old = task.run(() => pending.promise); task.reset(); hooks.dispose();
    pending.reject(new MCPError("provider_probe_failed")); await old;
    expect(hooks.render().state.error).toBeNull();
  });
  it("does not start another request after the owning panel unmounts", async () => {
    const hooks = hookSession(() => useMCPTask<boolean>());
    const task = hooks.render(); hooks.commit(); hooks.dispose();
    const work = vi.fn(async () => true);
    expect(await task.run(work)).toBeUndefined(); expect(work).not.toHaveBeenCalled();
  });
  it("drops arbitrary exception payloads and does not replay errors", async () => {
    const hooks = hookSession(() => useMCPTask<string>());
    const work = vi.fn(async () => { throw new Error("private-raw-upstream-response"); });
    const task = hooks.render(); hooks.commit(); await task.run(work);
    expect(hooks.render().state.error?.message).not.toContain("private-raw");
    expect(work).toHaveBeenCalledOnce(); hooks.dispose();
  });
});
