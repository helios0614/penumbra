import { SseParser } from "@/lib/sse/sse-parser";
import {
  SseFramingError,
  type ParseSseStreamOptions,
  type SseDataFrame,
} from "@/lib/sse/sse-types";

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseSseStreamOptions = {},
): AsyncGenerator<SseDataFrame, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parser = new SseParser();
  const abortError = new DOMException(
    "SSE stream reading aborted",
    "AbortError",
  );
  let reachedEof = false;
  let failure: unknown;
  let rejectAbort: ((error: DOMException) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abortReading = () => rejectAbort?.(abortError);

  options.signal?.addEventListener("abort", abortReading, { once: true });
  if (options.signal?.aborted) {
    abortReading();
  }

  try {
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) {
        reachedEof = true;
        break;
      }

      const text = decodeUtf8(decoder, result.value, true);
      for (const frame of parser.push(text)) {
        yield frame;
      }
    }

    const trailingText = decodeUtf8(decoder, undefined, false);
    for (const frame of parser.push(trailingText)) {
      yield frame;
    }
    for (const frame of parser.finish()) {
      yield frame;
    }
  } catch (error) {
    failure = options.signal?.aborted ? abortError : error;
    throw failure;
  } finally {
    options.signal?.removeEventListener("abort", abortReading);

    try {
      if (!reachedEof) {
        await reader.cancel(
          failure instanceof Error
            ? failure
            : new DOMException("SSE stream reading stopped", "AbortError"),
        );
      }
    } catch (cancelError) {
      if (failure === undefined) {
        throw cancelError;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

function decodeUtf8(
  decoder: TextDecoder,
  chunk: Uint8Array | undefined,
  stream: boolean,
): string {
  try {
    return chunk === undefined
      ? decoder.decode()
      : decoder.decode(chunk, { stream });
  } catch {
    throw new SseFramingError("SSE stream contains invalid UTF-8");
  }
}
