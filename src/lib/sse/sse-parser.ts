import {
  SseFramingError,
  type SseDataFrame,
} from "@/lib/sse/sse-types";

/** Incremental, Chat-agnostic parser for SSE data and named-event framing. */
export class SseParser {
  private buffer = "";
  private dataLines: string[] = [];
  private eventType: string | undefined;
  private hasDataField = false;
  private hasUnterminatedField = false;
  private finished = false;

  push(text: string): SseDataFrame[] {
    if (this.finished) {
      throw new SseFramingError("Cannot append to a finished SSE parser");
    }

    this.buffer += text;
    return this.consumeCompleteLines(false);
  }

  finish(): SseDataFrame[] {
    if (this.finished) {
      throw new SseFramingError("SSE parser was already finished");
    }

    this.finished = true;
    const frames = this.consumeCompleteLines(true);

    if (this.hasDataField || this.hasUnterminatedField) {
      throw new SseFramingError("SSE stream ended with an incomplete frame");
    }

    if (this.buffer.trim()) {
      throw new SseFramingError("SSE stream ended with an incomplete frame");
    }

    this.buffer = "";
    return frames;
  }

  private consumeCompleteLines(atEof: boolean): SseDataFrame[] {
    const frames: SseDataFrame[] = [];

    while (true) {
      const lineBreak = findLineBreak(this.buffer);
      if (lineBreak < 0) {
        break;
      }

      const marker = this.buffer[lineBreak];
      if (marker === "\r" && lineBreak === this.buffer.length - 1 && !atEof) {
        break;
      }

      const separatorLength =
        marker === "\r" && this.buffer[lineBreak + 1] === "\n" ? 2 : 1;
      const line = this.buffer.slice(0, lineBreak);
      this.buffer = this.buffer.slice(lineBreak + separatorLength);
      const frame = this.consumeLine(line);
      if (frame) {
        frames.push(frame);
      }
    }

    return frames;
  }

  private consumeLine(line: string): SseDataFrame | null {
    if (line === "") {
      const frame = this.hasDataField
        ? this.createFrame()
        : null;
      this.dataLines = [];
      this.eventType = undefined;
      this.hasDataField = false;
      this.hasUnterminatedField = false;
      return frame;
    }

    if (!line.trim() || line.startsWith(":")) {
      return null;
    }

    this.hasUnterminatedField = true;
    const colonIndex = line.indexOf(":");
    const field = colonIndex < 0 ? line : line.slice(0, colonIndex);
    let value = colonIndex < 0 ? "" : line.slice(colonIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "data") {
      this.hasDataField = true;
      this.dataLines.push(value);
    } else if (field === "event") {
      this.eventType = value || undefined;
    }

    return null;
  }

  private createFrame(): SseDataFrame {
    const data = this.dataLines.join("\n");
    return this.eventType === undefined
      ? { data }
      : { data, event: this.eventType };
  }
}

function findLineBreak(value: string): number {
  const lfIndex = value.indexOf("\n");
  const crIndex = value.indexOf("\r");

  if (lfIndex < 0) {
    return crIndex;
  }
  if (crIndex < 0) {
    return lfIndex;
  }
  return Math.min(lfIndex, crIndex);
}
