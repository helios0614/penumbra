import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  openWebSocketConnection,
  WebSocketTransportError,
  type WebSocketConnection,
} from "@/lib/websocket";

describe("single WebSocket connection opening", () => {
  beforeEach(installFakeWebSocket);
  afterEach(cleanupFakeWebSocket);

  it("creates exactly one socket, waits for open, and exposes no raw socket", async () => {
    const opening = openWebSocketConnection("wss://example.test/base/ws", {
      parseMessage: String,
      openTimeoutMs: 0,
    });
    const socket = lastSocket();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.url).toBe("wss://example.test/base/ws");

    let settled = false;
    void opening.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    socket.open();
    const connection = await opening;
    expect(Object.keys(connection).sort()).toEqual(["close", "closed", "events"]);
    expect(connection).not.toHaveProperty("socket");
    expect(connection).not.toHaveProperty("webSocket");
    expect(Object.isFrozen(connection)).toBe(true);

    connection.close();
    socket.peerClose(1000, "", true);
    await connection.closed;
  });

  it("rejects a pre-aborted caller without creating a socket", async () => {
    const caller = new AbortController();
    caller.abort("private abort reason");

    const error = await openWebSocketConnection("wss://example.test/ws", {
      parseMessage: String,
      signal: caller.signal,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(DOMException);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(String(error)).not.toContain("private abort reason");
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("times out opening, closes once, clears its timer, and removes listeners", async () => {
    vi.useFakeTimers();
    const opening = openWebSocketConnection("wss://example.test/ws", {
      parseMessage: String,
      openTimeoutMs: 25,
    });
    const assertion = expect(opening).rejects.toMatchObject({
      name: "WebSocketTransportError",
      code: "OPEN_TIMEOUT",
    });
    const socket = lastSocket();

    await vi.advanceTimersByTimeAsync(25);
    await assertion;

    expect(socket.closeCalls).toEqual([{ code: undefined, reason: undefined }]);
    expect(socket.activeListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves caller abort before open without exposing its reason", async () => {
    const caller = new AbortController();
    const opening = openWebSocketConnection("wss://example.test/ws", {
      parseMessage: String,
      signal: caller.signal,
      openTimeoutMs: 0,
    });
    const socket = lastSocket();
    caller.abort("fake-session-secret");

    const error = await opening.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DOMException);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(String(error)).not.toContain("fake-session-secret");
    expect(socket.closeCalls).toHaveLength(1);
    expect(socket.activeListenerCount()).toBe(0);
  });

  it("rejects a remote close before open without copying its untrusted reason", async () => {
    const opening = openWebSocketConnection("wss://example.test/ws", {
      parseMessage: String,
      openTimeoutMs: 0,
    });
    const socket = lastSocket();
    socket.peerClose(1008, "fake-auth-detail", false);

    const error = await opening.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(WebSocketTransportError);
    expect(error).toMatchObject({
      code: "CLOSED_BEFORE_OPEN",
      closeCode: 1008,
    });
    expect(error).not.toHaveProperty("closeReason");
    expect(String(error)).not.toContain("fake-auth-detail");
    expect(socket.activeListenerCount()).toBe(0);
  });

  it("rejects a socket error before open with only a generic transport cause", async () => {
    const opening = openWebSocketConnection("wss://example.test/ws", {
      parseMessage: String,
      openTimeoutMs: 0,
    });
    const socket = lastSocket();
    socket.fail();

    await expect(opening).rejects.toMatchObject({
      name: "WebSocketTransportError",
      code: "SOCKET_ERROR",
      message: "WebSocket connection failed",
    });
    expect(socket.closeCalls).toHaveLength(1);
    expect(socket.activeListenerCount()).toBe(0);
  });

  it("rejects invalid timeouts before constructing a socket", async () => {
    await expect(openWebSocketConnection("wss://example.test/ws", {
      parseMessage: String,
      openTimeoutMs: Number.NaN,
    })).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe("single WebSocket lifecycle and cleanup", () => {
  beforeEach(installFakeWebSocket);
  afterEach(cleanupFakeWebSocket);

  it("delivers messages in arrival order and removes consumed queue entries", async () => {
    const { connection, socket } = await openConnection((data) =>
      Number(data),
    );
    const iterator = connection.events[Symbol.asyncIterator]();

    socket.message("1");
    socket.message("2");
    socket.message("3");
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 3 });

    socket.peerClose(1000, "finished", true);
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    expect(await connection.closed).toEqual({
      code: 1000,
      reason: "finished",
      wasClean: true,
      initiatedLocally: false,
    });
  });

  it("can deliver an undefined parser result without mistaking it for an empty queue", async () => {
    const { connection, socket } = await openConnection(() => undefined);
    const iterator = connection.events[Symbol.asyncIterator]();
    socket.message("value");

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: undefined,
    });
    connection.close();
    socket.peerClose(1000, "", true);
    await connection.closed;
  });

  it("ends a pending iterator on a normal remote close", async () => {
    const { connection, socket } = await openConnection(String);
    const iterator = connection.events[Symbol.asyncIterator]();
    const pending = iterator.next();

    socket.peerClose(1000, "normal", true);

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    await expect(connection.closed).resolves.toMatchObject({
      code: 1000,
      initiatedLocally: false,
    });
    expect(socket.activeListenerCount()).toBe(0);
  });

  it("marks explicit close as local and forwards only caller-selected close data", async () => {
    const { connection, socket } = await openConnection(String);
    const iterator = connection.events[Symbol.asyncIterator]();
    const pending = iterator.next();

    connection.close(3001, "leaving");
    expect(socket.closeCalls).toEqual([{ code: 3001, reason: "leaving" }]);
    await expect(pending).resolves.toEqual({ done: true, value: undefined });

    socket.peerClose(3001, "leaving", true);
    await expect(connection.closed).resolves.toEqual({
      code: 3001,
      reason: "leaving",
      wasClean: true,
      initiatedLocally: true,
    });
  });

  it("rejects a pending iterator on caller abort after open", async () => {
    const caller = new AbortController();
    const { connection, socket } = await openConnection(String, caller.signal);
    const iterator = connection.events[Symbol.asyncIterator]();
    const pending = iterator.next();

    caller.abort("fake-private-reason");
    const error = await pending.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(DOMException);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(String(error)).not.toContain("fake-private-reason");
    expect(socket.closeCalls).toHaveLength(1);

    socket.peerClose(1000, "", true);
    await expect(connection.closed).resolves.toMatchObject({
      initiatedLocally: true,
    });
    expect(socket.activeListenerCount()).toBe(0);
  });

  it("discards unread queued messages when the caller aborts", async () => {
    const caller = new AbortController();
    const { connection, socket } = await openConnection(String, caller.signal);
    const iterator = connection.events[Symbol.asyncIterator]();
    socket.message("stale-after-abort");

    caller.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });

    socket.peerClose(1000, "", true);
    await connection.closed;
  });

  it("closes and clears pending events when a consumer stops early", async () => {
    const { connection, socket } = await openConnection(String);
    socket.message("first");
    socket.message("must-not-be-retained");

    for await (const event of connection.events) {
      expect(event).toBe("first");
      break;
    }

    expect(socket.closeCalls).toHaveLength(1);
    socket.peerClose(1000, "", true);
    await connection.closed;
    expect(socket.activeListenerCount()).toBe(0);
  });

  it("fails iteration on socket error without labeling it as caller-local", async () => {
    const { connection, socket } = await openConnection(String);
    const iterator = connection.events[Symbol.asyncIterator]();
    const pending = iterator.next();

    socket.fail();
    await expect(pending).rejects.toMatchObject({
      name: "WebSocketTransportError",
      code: "SOCKET_ERROR",
    });
    expect(socket.closeCalls).toHaveLength(1);

    socket.peerClose(1006, "", false);
    await expect(connection.closed).resolves.toMatchObject({
      code: 1006,
      wasClean: false,
      initiatedLocally: false,
    });
  });

  it("propagates a message parser failure and terminates locally", async () => {
    const contractError = new Error("safe contract failure");
    const { connection, socket } = await openConnection(() => {
      throw contractError;
    });
    const iterator = connection.events[Symbol.asyncIterator]();
    const pending = iterator.next();

    socket.message("untrusted payload");
    await expect(pending).rejects.toBe(contractError);
    expect(socket.closeCalls).toHaveLength(1);

    socket.peerClose(1000, "", true);
    await expect(connection.closed).resolves.toMatchObject({
      initiatedLocally: true,
    });
  });

  it("allows only one ordered consumer for a single connection", async () => {
    const { connection, socket } = await openConnection(String);
    const first = connection.events[Symbol.asyncIterator]();
    const second = connection.events[Symbol.asyncIterator]();

    await expect(second.next()).rejects.toMatchObject({
      code: "ALREADY_CONSUMED",
    });
    await first.return?.();
    socket.peerClose(1000, "", true);
    await connection.closed;
  });

  it("clears the open timer and every listener after a clean close", async () => {
    vi.useFakeTimers();
    const opening = openWebSocketConnection("wss://example.test/ws", {
      parseMessage: String,
      openTimeoutMs: 50,
    });
    const socket = lastSocket();
    socket.open();
    const connection = await opening;

    expect(vi.getTimerCount()).toBe(0);
    socket.peerClose(1000, "", true);
    await connection.closed;
    expect(socket.activeListenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reconnect after remote close or elapsed time", async () => {
    vi.useFakeTimers();
    const { connection, socket } = await openConnection(String);
    socket.peerClose(1008, "policy", false);
    await connection.closed;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

async function openConnection<T>(
  parseMessage: (data: unknown) => T,
  signal?: AbortSignal,
): Promise<{
  connection: WebSocketConnection<T>;
  socket: FakeWebSocket;
}> {
  const opening = openWebSocketConnection("wss://example.test/ws", {
    parseMessage,
    signal,
    openTimeoutMs: 0,
  });
  const socket = lastSocket();
  socket.open();
  return { connection: await opening, socket };
}

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly closeCalls: Array<{ code: number | undefined; reason: string | undefined }> = [];
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, callback, options);
    if (callback) {
      const callbacks = this.listeners.get(type) ?? new Set();
      callbacks.add(callback);
      this.listeners.set(type, callbacks);
    }
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, callback, options);
    if (callback) {
      this.listeners.get(type)?.delete(callback);
    }
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
  }

  open(): void {
    this.dispatchEvent(new Event("open"));
  }

  message(data: unknown): void {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: data });
    this.dispatchEvent(event);
  }

  fail(): void {
    this.dispatchEvent(new Event("error"));
  }

  peerClose(code: number, reason: string, wasClean: boolean): void {
    const event = new Event("close");
    Object.defineProperties(event, {
      code: { value: code },
      reason: { value: reason },
      wasClean: { value: wasClean },
    });
    this.dispatchEvent(event);
  }

  activeListenerCount(): number {
    let count = 0;
    for (const callbacks of this.listeners.values()) {
      count += callbacks.size;
    }
    return count;
  }
}

function installFakeWebSocket(): void {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
}

function cleanupFakeWebSocket(): void {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
}

function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) {
    throw new Error("Expected a WebSocket instance");
  }
  return socket;
}
