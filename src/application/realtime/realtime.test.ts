import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mapRealtimeEvent,
  openRealtimeEvents,
  parseRealtimeMessageData,
  RealtimeContractError,
  RealtimeDataError,
  type RealtimeConnection,
  type RealtimeEvent,
} from "@/application/realtime";

describe("AionHome realtime event projection", () => {
  it.each([
    [
      "msg_created",
      { type: "message-created", messageId: "msg_1", conversationId: "conv_1" },
    ],
    [
      "msg_updated",
      { type: "message-updated", messageId: "msg_1", conversationId: "conv_1" },
    ],
    [
      "msg_deleted",
      { type: "message-deleted", messageId: "msg_1", conversationId: "conv_1" },
    ],
  ])("maps the real %s envelope to stable message identifiers", (rawType, expected) => {
    expect(mapRealtimeEvent({
      type: rawType,
      data: {
        id: "msg_1",
        conv_id: "conv_1",
        role: "assistant",
        content: "must be dropped",
        attachments: [{ secret: "must be dropped" }],
      },
      tts: true,
    })).toEqual(expected);
  });

  it.each([
    ["conv_created", "conversation-created"],
    ["conv_updated", "conversation-updated"],
    ["conv_deleted", "conversation-deleted"],
  ])("maps the real %s envelope to a stable conversation identifier", (rawType, type) => {
    expect(mapRealtimeEvent({
      type: rawType,
      data: {
        id: "conv_1",
        title: "must be dropped",
        model: "must be dropped",
      },
    })).toEqual({ type, conversationId: "conv_1" });
  });

  it("maps file_synced from data.conv_id without treating it as a message", () => {
    expect(mapRealtimeEvent({
      type: "file_synced",
      data: { conv_id: "conv_file", markdown: "must be dropped" },
    })).toEqual({ type: "file-synced", conversationId: "conv_file" });
  });

  it("returns a detached identifier projection with no Message DTO fields", () => {
    const input = {
      type: "msg_created",
      data: {
        id: "msg_original",
        conv_id: "conv_original",
        role: "assistant",
        content: "private content",
        created_at: 123,
        attachments: ["private attachment"],
      },
    };

    const event = mapRealtimeEvent(input);
    input.data.id = "msg_changed";
    input.data.conv_id = "conv_changed";

    expect(event).toEqual({
      type: "message-created",
      messageId: "msg_original",
      conversationId: "conv_original",
    });
    expect(event).not.toHaveProperty("role");
    expect(event).not.toHaveProperty("content");
    expect(event).not.toHaveProperty("attachments");
    expect(event).not.toHaveProperty("raw");
    expect(event).not.toHaveProperty("data");
  });

  it.each([
    { type: "msg_created", data: { conv_id: "conv" } },
    { type: "msg_updated", data: { id: "", conv_id: "conv" } },
    { type: "msg_deleted", data: { id: "msg", conv_id: 1 } },
    { type: "conv_created", data: {} },
    { type: "conv_updated", data: { id: "   " } },
    { type: "conv_deleted", data: { id: null } },
    { type: "file_synced", data: { conv_id: [] } },
    { type: "msg_created", data: null },
  ])("rejects malformed known events instead of downgrading them", (input) => {
    expect(() => mapRealtimeEvent(input)).toThrow(RealtimeContractError);
  });

  it("maps capability, debug, pong, and future types to payload-free unknown markers", () => {
    const fakeSecret = "fake-debug-secret";
    for (const rawType of [
      "debug",
      "mcp_loading",
      "heart_whisper",
      "music",
      "cam_check",
      "poi_search",
      "location_check",
      "activity_check",
      "chat_status",
      "pong",
      "future_event",
    ]) {
      const event = mapRealtimeEvent({
        type: rawType,
        data: { prompt: fakeSecret, endpoint: fakeSecret, provider: fakeSecret },
      });
      expect(event).toEqual({ type: "unknown", rawType });
      expect(JSON.stringify(event)).not.toContain(fakeSecret);
      expect(Object.keys(event).sort()).toEqual(["rawType", "type"]);
    }
  });

  it.each([
    undefined,
    null,
    [],
    "msg_created",
    {},
    { type: "" },
    { type: "   " },
    { type: 1 },
    { type: null },
    new (class EventEnvelope { type = "future"; })(),
  ])("rejects invalid top-level envelopes", (input) => {
    expect(() => mapRealtimeEvent(input)).toThrow(RealtimeContractError);
  });

  it("does not invoke accessor fields or expose values from contract failures", () => {
    const fakeSecret = "fake-accessor-secret";
    const input = Object.defineProperty({}, "type", {
      enumerable: true,
      get() {
        throw new Error(fakeSecret);
      },
    });

    const error = (() => {
      try {
        mapRealtimeEvent(input);
      } catch (reason) {
        return reason;
      }
    })();

    expect(error).toBeInstanceOf(RealtimeContractError);
    expect(String(error)).not.toContain(fakeSecret);
  });
});

describe("realtime WebSocket message data", () => {
  it("parses valid JSON text and applies the realtime event contract", () => {
    expect(parseRealtimeMessageData(JSON.stringify({
      type: "msg_deleted",
      data: { id: "msg_1", conv_id: "conv_1", content: "drop" },
    }))).toEqual({
      type: "message-deleted",
      messageId: "msg_1",
      conversationId: "conv_1",
    });
  });

  it.each(["", "{", "not json"])("rejects malformed or empty JSON text safely", (data) => {
    const error = (() => {
      try {
        parseRealtimeMessageData(data);
      } catch (reason) {
        return reason;
      }
    })();
    expect(error).toBeInstanceOf(RealtimeDataError);
    expect(String(error)).not.toContain(data || "unused");
  });

  it.each([
    new Blob(["binary fake secret"]),
    new ArrayBuffer(2),
    new Uint8Array([1, 2]),
  ])("rejects Blob, ArrayBuffer, and binary views without inspecting bytes", (data) => {
    expect(() => parseRealtimeMessageData(data)).toThrow(RealtimeDataError);
  });

  it("keeps valid JSON contract failures distinct from data decoding failures", () => {
    expect(() => parseRealtimeMessageData(JSON.stringify({
      type: "msg_created",
      data: { id: "msg_missing_conversation" },
    }))).toThrow(RealtimeContractError);
  });
});

describe("realtime connection", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let consoleLog: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    RealtimeFakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", RealtimeFakeWebSocket);
    vi.stubGlobal("fetch", fetchMock);
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleError.mockRestore();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    RealtimeFakeWebSocket.instances = [];
  });

  it("uses the runtime /ws URL once without token, push, HTTP, or domain calls", async () => {
    const { connection, socket } = await openRealtimeConnection();

    expect(RealtimeFakeWebSocket.instances).toHaveLength(1);
    expect(socket.url).toMatch(/\/ws$/);
    expect(socket.url).not.toContain("/ws/android-push");
    expect(socket.url).not.toMatch(/[?&](token|session|secret|authorization)=/i);
    expect(fetchMock).not.toHaveBeenCalled();

    connection.close();
    socket.peerClose(1000, "", true);
    await connection.closed;
  });

  it("continues from a payload-free unknown event to the next known event", async () => {
    const { connection, socket } = await openRealtimeConnection();
    const collecting = collectEvents(connection);

    socket.message(JSON.stringify({
      type: "debug",
      data: { prompt: "fake-debug-secret", provider: "fake-provider-secret" },
    }));
    socket.message(JSON.stringify({
      type: "msg_created",
      data: {
        id: "msg_1",
        conv_id: "conv_1",
        content: "private persisted content",
      },
    }));
    socket.peerClose(1000, "complete", true);

    await expect(collecting).resolves.toEqual([
      { type: "unknown", rawType: "debug" },
      {
        type: "message-created",
        messageId: "msg_1",
        conversationId: "conv_1",
      },
    ]);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("terminates on malformed JSON without exposing raw data or logging it", async () => {
    const { connection, socket } = await openRealtimeConnection();
    const iterator = connection.events[Symbol.asyncIterator]();
    const fakeSecret = "fake-json-secret";
    const pending = iterator.next();

    socket.message(`{"prompt":"${fakeSecret}`);
    const error = await pending.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(RealtimeDataError);
    expect(String(error)).not.toContain(fakeSecret);
    expect(socket.closeCalls).toHaveLength(1);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    socket.peerClose(1000, "", true);
    await connection.closed;
  });

  it("terminates on a malformed known event rather than swallowing it", async () => {
    const { connection, socket } = await openRealtimeConnection();
    const iterator = connection.events[Symbol.asyncIterator]();
    const pending = iterator.next();

    socket.message(JSON.stringify({
      type: "msg_updated",
      data: { id: "msg_without_conversation" },
    }));

    await expect(pending).rejects.toBeInstanceOf(RealtimeContractError);
    expect(socket.closeCalls).toHaveLength(1);
    socket.peerClose(1000, "", true);
    await connection.closed;
  });

  it("preserves close code 1008 as close information without creating session state", async () => {
    const { connection, socket } = await openRealtimeConnection();
    const collecting = collectEvents(connection);
    socket.peerClose(1008, "policy detail", false);

    await expect(collecting).resolves.toEqual([]);
    const closeInfo = await connection.closed;
    expect(closeInfo).toEqual({
      code: 1008,
      reason: "policy detail",
      wasClean: false,
      initiatedLocally: false,
    });
    expect(closeInfo).not.toHaveProperty("authenticated");
    expect(closeInfo).not.toHaveProperty("session");
    expect(closeInfo).not.toHaveProperty("uiMessage");
  });
});

async function collectEvents(
  connection: RealtimeConnection,
): Promise<RealtimeEvent[]> {
  const events: RealtimeEvent[] = [];
  for await (const event of connection.events) {
    events.push(event);
  }
  return events;
}

async function openRealtimeConnection(): Promise<{
  connection: RealtimeConnection;
  socket: RealtimeFakeWebSocket;
}> {
  const opening = openRealtimeEvents({ openTimeoutMs: 0 });
  const socket =
    RealtimeFakeWebSocket.instances[RealtimeFakeWebSocket.instances.length - 1];
  if (!socket) {
    throw new Error("Expected realtime WebSocket");
  }
  socket.open();
  return { connection: await opening, socket };
}

class RealtimeFakeWebSocket extends EventTarget {
  static instances: RealtimeFakeWebSocket[] = [];

  readonly url: string;
  readonly closeCalls: Array<{ code: number | undefined; reason: string | undefined }> = [];

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    RealtimeFakeWebSocket.instances.push(this);
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

  peerClose(code: number, reason: string, wasClean: boolean): void {
    const event = new Event("close");
    Object.defineProperties(event, {
      code: { value: code },
      reason: { value: reason },
      wasClean: { value: wasClean },
    });
    this.dispatchEvent(event);
  }
}
