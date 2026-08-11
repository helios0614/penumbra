import { describe, expect, it, vi } from "vitest";

import {
  SseDataError,
  SseFramingError,
  parseSseJsonData,
  parseSseStream,
  type ParseSseStreamOptions,
  type SseDataFrame,
} from "@/lib/sse";

describe("SSE framing", () => {
  it("parses a single frame from a single chunk", async () => {
    await expect(framesFromStrings(["data: hello\n\n"])).resolves.toEqual([
      { data: "hello" },
    ]);
  });

  it("parses multiple frames from one network chunk in arrival order", async () => {
    await expect(
      framesFromStrings(["data: first\n\ndata: second\n\n"]),
    ).resolves.toEqual([{ data: "first" }, { data: "second" }]);
  });

  it("parses a frame, field name, and value split across chunks", async () => {
    await expect(
      framesFromStrings(["da", "ta", ": val", "ue\n", "\n"]),
    ).resolves.toEqual([{ data: "value" }]);
  });

  it("preserves a named event on its data frame and resets it per frame", async () => {
    await expect(framesFromStrings([
      "eve",
      "nt: persisted\nda",
      "ta: {\"id\":\"assistant-1\"}\n\n",
      "event: ignored-without-data\n\n",
      "data: next\n\n",
    ])).resolves.toEqual([
      {
        data: '{"id":"assistant-1"}',
        event: "persisted",
      },
      { data: "next" },
    ]);
  });

  it("supports LF, CRLF, spaced and unspaced data fields", async () => {
    await expect(
      framesFromStrings([
        "data: spaced\r\n\r\ndata:unspaced\ndata: next\n\n",
      ]),
    ).resolves.toEqual([
      { data: "spaced" },
      { data: "unspaced\nnext" },
    ]);
  });

  it("handles CRLF delimiters split across byte chunks", async () => {
    await expect(
      framesFromStrings(["data: split\r", "\n\r", "\n"]),
    ).resolves.toEqual([{ data: "split" }]);
  });

  it("emits empty data and joins multiple data lines with newlines", async () => {
    await expect(
      framesFromStrings(["data:\n\ndata: first\ndata:\ndata:third\n\n"]),
    ).resolves.toEqual([
      { data: "" },
      { data: "first\n\nthird" },
    ]);
  });

  it("ignores comments, unknown fields, continuous empty lines, and whitespace", async () => {
    await expect(
      framesFromStrings([
        " \n\n: comment\nunknown: ignored\ndata: kept\n\n\n\n\t",
      ]),
    ).resolves.toEqual([{ data: "kept" }]);
  });

  it("accepts an empty stream and whitespace-only EOF", async () => {
    await expect(framesFromStrings([])).resolves.toEqual([]);
    await expect(framesFromStrings([" \t"])).resolves.toEqual([]);
  });

  it("accepts a normally delimited frame at EOF", async () => {
    await expect(framesFromStrings(["data: complete\n\n"])).resolves.toEqual([
      { data: "complete" },
    ]);
  });

  it("rejects an unterminated non-empty frame at EOF without leaking data", async () => {
    const fakeSecret = "fake-secret-value";
    const error = await framesFromStrings([
      `data: {\"secret\":\"${fakeSecret}\"}`,
    ]).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SseFramingError);
    expect((error as Error).message).not.toContain(fakeSecret);
    expect((error as Error).message).not.toContain("secret");
  });
});

describe("SSE UTF-8 streaming decode", () => {
  it("preserves mixed ASCII, Chinese, and emoji split at every byte", async () => {
    const data = "Penumbra 知远 😺 ready";
    const bytes = encode(`data: ${data}\n\n`);
    const chunks = Array.from(bytes, (_value, index) =>
      bytes.slice(index, index + 1),
    );

    await expect(collectFrames(byteStream(chunks))).resolves.toEqual([
      { data },
    ]);
  });

  it("flushes the decoder and safely rejects an incomplete UTF-8 tail", async () => {
    const truncatedEmoji = new Uint8Array([0xf0, 0x9f, 0x98]);
    const error = await collectFrames(byteStream([truncatedEmoji])).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(SseFramingError);
    expect((error as Error).message).toBe(
      "SSE stream contains invalid UTF-8",
    );
  });
});

describe("SSE async iteration and cleanup", () => {
  it("releases the reader lock after complete consumption", async () => {
    const stream = byteStream([encode("data: done\n\n")]);

    await expect(collectFrames(stream)).resolves.toEqual([{ data: "done" }]);
    expect(stream.locked).toBe(false);
  });

  it("cancels and releases the reader when a consumer breaks early", async () => {
    const cancel = vi.fn();
    const stream = byteStream(
      [encode("data: first\n\n"), encode("data: second\n\n")],
      cancel,
      false,
    );

    for await (const frame of parseSseStream(stream)) {
      expect(frame).toEqual({ data: "first" });
      break;
    }

    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("cancels, releases, and reports caller abort distinctly", async () => {
    const caller = new AbortController();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const reading = collectFrames(stream, { signal: caller.signal });
    caller.abort("navigation");

    const error = await reading.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DOMException);
    expect(error).toMatchObject({ name: "AbortError" });
    expect((error as Error).message).not.toContain("navigation");
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("propagates reader failures and releases the reader lock", async () => {
    const failure = new Error("reader failed");
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw failure;
      },
    });

    await expect(collectFrames(stream)).rejects.toBe(failure);
    expect(stream.locked).toBe(false);
  });
});

describe("SSE JSON data helper", () => {
  it("parses JSON without applying Chat event semantics", () => {
    expect(parseSseJsonData({ data: '{"anything":true}' })).toEqual({
      anything: true,
    });
  });

  it("reports malformed JSON without retaining or exposing raw data", () => {
    const fakeToken = "fake-token-value";
    const error = (() => {
      try {
        parseSseJsonData({ data: `{\"token\":\"${fakeToken}` });
      } catch (reason) {
        return reason;
      }
    })();

    expect(error).toBeInstanceOf(SseDataError);
    expect((error as Error).message).not.toContain(fakeToken);
    expect(error).not.toHaveProperty("data");
  });
});

async function framesFromStrings(chunks: string[]): Promise<SseDataFrame[]> {
  return collectFrames(byteStream(chunks.map(encode)));
}

async function collectFrames(
  stream: ReadableStream<Uint8Array>,
  options?: ParseSseStreamOptions,
): Promise<SseDataFrame[]> {
  const frames: SseDataFrame[] = [];
  for await (const frame of parseSseStream(stream, options)) {
    frames.push(frame);
  }
  return frames;
}

function byteStream(
  chunks: Uint8Array[],
  cancel?: (reason?: unknown) => void,
  close = true,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (close) {
        controller.close();
      }
    },
    cancel,
  });
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
