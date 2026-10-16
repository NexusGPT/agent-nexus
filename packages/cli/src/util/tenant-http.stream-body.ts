/**
 * The response body as decoded text, chunk by chunk.
 *
 * `getReader()` rather than `for await (… of body)` so the cancel in `finally`
 * is explicit: a caller that stops iterating — a `break`, a throw, an abort —
 * must not leave the socket held. `reader.cancel()` returns a promise, and its
 * rejection is caught rather than floated: the socket is frequently already gone
 * by the time this runs, and an unhandled rejection terminates Node.
 */
export async function* readTextChunks(
  body: ReadableStream<Uint8Array>,
  onDone: () => void
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) yield decoder.decode(value, { stream: true });
    }
    // Flush whatever a multi-byte character left straddling the last chunk.
    const tail = decoder.decode();
    if (tail.length > 0) yield tail;
  } finally {
    reader.cancel().catch(() => undefined);
    onDone();
  }
}
