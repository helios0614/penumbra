export const DEFAULT_WEBSOCKET_OPEN_TIMEOUT_MS = 10_000;

export type WebSocketCloseInfo = {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
  readonly initiatedLocally: boolean;
};

export type WebSocketConnection<T> = {
  readonly events: AsyncIterable<T>;
  readonly closed: Promise<WebSocketCloseInfo>;
  close(code?: number, reason?: string): void;
};

export type OpenWebSocketConnectionOptions<T> = {
  readonly parseMessage: (data: unknown) => T;
  readonly signal?: AbortSignal;
  readonly openTimeoutMs?: number;
};

export type WebSocketTransportErrorCode =
  | "INVALID_OPTIONS"
  | "SOCKET_CREATION_FAILED"
  | "OPEN_TIMEOUT"
  | "CLOSED_BEFORE_OPEN"
  | "SOCKET_ERROR"
  | "ALREADY_CONSUMED";

export class WebSocketTransportError extends Error {
  readonly code: WebSocketTransportErrorCode;
  readonly closeCode: number | null;

  constructor(
    message: string,
    code: WebSocketTransportErrorCode,
    closeCode: number | null = null,
  ) {
    super(message);
    this.name = "WebSocketTransportError";
    this.code = code;
    this.closeCode = closeCode;
  }
}
