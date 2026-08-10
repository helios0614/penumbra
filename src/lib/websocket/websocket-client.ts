import {
  DEFAULT_WEBSOCKET_OPEN_TIMEOUT_MS,
  WebSocketTransportError,
  type OpenWebSocketConnectionOptions,
  type WebSocketCloseInfo,
  type WebSocketConnection,
} from "@/lib/websocket/websocket-types";

type ConnectionState =
  | "connecting"
  | "open"
  | "closing"
  | "failing"
  | "closed";

type QueueWaiter<T> = {
  readonly resolve: (result: IteratorResult<T>) => void;
  readonly reject: (error: unknown) => void;
};

/**
 * Opens exactly one browser WebSocket and resolves only after its open event.
 * Message parsing is injected by the owning protocol layer.
 */
export function openWebSocketConnection<T>(
  url: string,
  options: OpenWebSocketConnectionOptions<T>,
): Promise<WebSocketConnection<T>> {
  const timeoutMs =
    options.openTimeoutMs ?? DEFAULT_WEBSOCKET_OPEN_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    return Promise.reject(
      new WebSocketTransportError(
        "WebSocket open timeout must be a finite non-negative number",
        "INVALID_OPTIONS",
      ),
    );
  }

  if (options.signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    return Promise.reject(
      new WebSocketTransportError(
        "WebSocket connection could not be created",
        "SOCKET_CREATION_FAILED",
      ),
    );
  }

  return new ManagedWebSocketConnection(socket, options, timeoutMs).opened;
}

class ManagedWebSocketConnection<T> {
  readonly opened: Promise<WebSocketConnection<T>>;

  private readonly queue = new AsyncEventQueue<T>();
  private readonly socket: WebSocket;
  private readonly parseMessage: (data: unknown) => T;
  private readonly signal: AbortSignal | undefined;
  private readonly connection: WebSocketConnection<T>;
  private readonly resolveOpened: (connection: WebSocketConnection<T>) => void;
  private readonly rejectOpened: (error: unknown) => void;
  private readonly resolveClosed: (info: WebSocketCloseInfo) => void;
  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private state: ConnectionState = "connecting";
  private initiatedLocally = false;
  private eventsClaimed = false;

  constructor(
    socket: WebSocket,
    options: OpenWebSocketConnectionOptions<T>,
    timeoutMs: number,
  ) {
    this.socket = socket;
    this.parseMessage = options.parseMessage;
    this.signal = options.signal;

    let resolveOpened!: (connection: WebSocketConnection<T>) => void;
    let rejectOpened!: (error: unknown) => void;
    this.opened = new Promise<WebSocketConnection<T>>((resolve, reject) => {
      resolveOpened = resolve;
      rejectOpened = reject;
    });
    this.resolveOpened = resolveOpened;
    this.rejectOpened = rejectOpened;

    let resolveClosed!: (info: WebSocketCloseInfo) => void;
    const closed = new Promise<WebSocketCloseInfo>((resolve) => {
      resolveClosed = resolve;
    });
    this.resolveClosed = resolveClosed;

    this.connection = Object.freeze({
      events: Object.freeze({
        [Symbol.asyncIterator]: () => this.createEventIterator(),
      }),
      closed,
      close: (code?: number, reason?: string) => this.close(code, reason),
    });

    socket.addEventListener("open", this.handleOpen);
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", this.handleClose);
    socket.addEventListener("error", this.handleError);
    this.signal?.addEventListener("abort", this.handleAbort, { once: true });

    if (timeoutMs > 0) {
      this.openTimer = setTimeout(this.handleOpenTimeout, timeoutMs);
    }

    if (this.signal?.aborted) {
      this.handleAbort();
    }
  }

  private readonly handleOpen = () => {
    if (this.state !== "connecting") {
      return;
    }

    this.state = "open";
    this.clearOpenTimer();
    this.socket.removeEventListener("open", this.handleOpen);
    this.resolveOpened(this.connection);
  };

  private readonly handleMessage = (event: MessageEvent<unknown>) => {
    if (this.state !== "open") {
      return;
    }

    try {
      this.queue.push(this.parseMessage(event.data));
    } catch (error) {
      this.state = "failing";
      this.initiatedLocally = true;
      this.queue.fail(error);
      this.closeSocket();
    }
  };

  private readonly handleClose = (event: CloseEvent) => {
    if (this.state === "closed") {
      return;
    }

    if (this.state === "connecting") {
      this.rejectOpened(
        new WebSocketTransportError(
          "WebSocket closed before opening",
          "CLOSED_BEFORE_OPEN",
          event.code,
        ),
      );
    } else if (this.state === "open") {
      this.queue.finish();
    }

    this.state = "closed";
    this.clearOpenTimer();
    this.removeAllListeners();
    this.resolveClosed(Object.freeze({
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      initiatedLocally: this.initiatedLocally,
    }));
  };

  private readonly handleError = () => {
    const error = new WebSocketTransportError(
      "WebSocket connection failed",
      "SOCKET_ERROR",
    );

    if (this.state === "connecting") {
      this.failBeforeOpen(error);
      return;
    }

    if (this.state !== "open") {
      return;
    }

    this.state = "failing";
    this.queue.fail(error);
    this.closeSocket();
  };

  private readonly handleAbort = () => {
    const error = createAbortError();

    if (this.state === "connecting") {
      this.initiatedLocally = true;
      this.failBeforeOpen(error);
      return;
    }

    if (this.state !== "open") {
      return;
    }

    this.state = "closing";
    this.initiatedLocally = true;
    this.queue.fail(error, true);
    this.closeSocket();
  };

  private readonly handleOpenTimeout = () => {
    if (this.state !== "connecting") {
      return;
    }

    this.initiatedLocally = true;
    this.failBeforeOpen(
      new WebSocketTransportError(
        "WebSocket opening timed out",
        "OPEN_TIMEOUT",
      ),
    );
  };

  private close(code?: number, reason?: string): void {
    if (this.state !== "open") {
      return;
    }

    this.state = "closing";
    this.initiatedLocally = true;
    this.queue.finish();
    this.closeSocket(code, reason);
  }

  private createEventIterator(): AsyncIterator<T> {
    if (this.eventsClaimed) {
      return failedIterator(
        new WebSocketTransportError(
          "WebSocket events can only be consumed once",
          "ALREADY_CONSUMED",
        ),
      );
    }

    this.eventsClaimed = true;
    return this.iterateEvents();
  }

  private async *iterateEvents(): AsyncGenerator<T, void, void> {
    let reachedEnd = false;
    try {
      while (true) {
        const result = await this.queue.next();
        if (result.done) {
          reachedEnd = true;
          return;
        }
        yield result.value;
      }
    } finally {
      if (!reachedEnd && this.state === "open") {
        this.close();
      }
      this.queue.clear();
    }
  }

  private failBeforeOpen(error: unknown): void {
    if (this.state !== "connecting") {
      return;
    }

    this.state = "closed";
    this.rejectOpened(error);
    this.clearOpenTimer();
    this.removeAllListeners();
    this.closeSocket();
  }

  private closeSocket(code?: number, reason?: string): void {
    try {
      if (code === undefined) {
        this.socket.close();
      } else {
        this.socket.close(code, reason);
      }
    } catch {
      try {
        this.socket.close();
      } catch {
        // A close request is best-effort; lifecycle errors remain available
        // without exposing caller-provided close arguments.
      }
    }
  }

  private clearOpenTimer(): void {
    if (this.openTimer !== undefined) {
      clearTimeout(this.openTimer);
      this.openTimer = undefined;
    }
  }

  private removeAllListeners(): void {
    this.socket.removeEventListener("open", this.handleOpen);
    this.socket.removeEventListener("message", this.handleMessage);
    this.socket.removeEventListener("close", this.handleClose);
    this.socket.removeEventListener("error", this.handleError);
    this.signal?.removeEventListener("abort", this.handleAbort);
  }
}

class AsyncEventQueue<T> {
  private readonly values: T[] = [];
  private readonly waiters: QueueWaiter<T>[] = [];
  private finished = false;
  private failure: unknown;
  private hasFailure = false;

  push(value: T): void {
    if (this.finished || this.hasFailure) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
    } else {
      this.values.push(value);
    }
  }

  finish(): void {
    if (this.finished || this.hasFailure) {
      return;
    }

    this.finished = true;
    this.flushTerminalWaiters();
  }

  fail(error: unknown, discardValues = false): void {
    if (this.finished || this.hasFailure) {
      return;
    }

    if (discardValues) {
      this.values.length = 0;
    }
    this.hasFailure = true;
    this.failure = error;
    this.flushTerminalWaiters();
  }

  next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) {
      const value = this.values.shift() as T;
      return Promise.resolve({ done: false, value });
    }

    if (this.hasFailure) {
      return Promise.reject(this.failure);
    }

    if (this.finished) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  clear(): void {
    this.values.length = 0;
    if (!this.finished && !this.hasFailure) {
      this.finished = true;
    }
    this.flushTerminalWaiters();
  }

  private flushTerminalWaiters(): void {
    if (this.values.length > 0) {
      return;
    }

    for (const waiter of this.waiters.splice(0)) {
      if (this.hasFailure) {
        waiter.reject(this.failure);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }
}

function createAbortError(): DOMException {
  return new DOMException("WebSocket connection aborted", "AbortError");
}

function failedIterator<T>(error: unknown): AsyncIterator<T> {
  return {
    next: () => Promise.reject(error),
  };
}
