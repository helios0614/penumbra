/** Public synthetic HTTP envelope. Never derives a production cursor from time/ID. */
export function messageWindowWire(
  messages: readonly unknown[],
  conversationId = "conv_1",
  hasOlder = false,
) {
  return {
    conversation_id: conversationId,
    anchor_id: null,
    messages,
    older_cursor: hasOlder ? "synthetic-older" : null,
    newer_cursor: null,
    has_older: hasOlder,
    has_newer: false,
    reaches_latest: true,
    page_status: "ready",
  };
}
