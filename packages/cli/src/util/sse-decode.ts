/**
 * The Server-Sent Events line protocol, decoded incrementally.
 *
 * This is the CLI's first SSE consumer — nothing in `packages/cli/src` read a
 * `text/event-stream` before `apps logs --follow`. It is a module of its own,
 * fed strings rather than a socket, because every interesting case is a
 * SPLITTING case: a frame arriving in two chunks, a chunk carrying two frames,
 * a keepalive comment between them. None of those are reachable from a test
 * that owns the transport, and all of them are one `decoder.push(...)` call
 * apart from a test that owns the decoder.
 *
 * What it implements, from the WHATWG event-stream grammar, is the part the
 * Vibe log streams actually use:
 *
 *   - `\r\n`, `\n` and `\r` are all line terminators. A LONE `\r` at the very
 *     end of the buffer is held rather than acted on, because it may be the
 *     first half of a `\r\n` whose second half is in the next chunk. Rewriting
 *     it to `\n` on sight is the obvious move and it is wrong: it turns one
 *     terminator into two, which dispatches an event a line early and splits a
 *     multi-line `data:` payload in half.
 *   - A line beginning `:` is a COMMENT and is discarded. This is the whole of
 *     `VibeSseFrameWriter`'s `: keepalive` mechanism, and a decoder that did not
 *     drop it would hand `JSON.parse` a colon every 15 seconds.
 *   - `data:` accumulates, one optional leading space stripped, multiple `data:`
 *     lines in one event joined with `\n` — which is the specified behaviour and
 *     is what makes a log line containing a newline survive the wire.
 *   - A BLANK line dispatches the accumulated data as one event.
 *   - Every other field (`event:`, `id:`, `retry:`) is ignored. Deliberately:
 *     the console-facing Vibe wire is data-only and puts its discriminant INSIDE
 *     the JSON, so a decoder that reported event names would invite a consumer
 *     to read a field the producer does not write.
 *
 * An event whose data never accumulated (a lone `id:`, a stray comment) yields
 * nothing rather than an empty string, so a caller never has to distinguish
 * "the server sent an empty payload" from "there was nothing there".
 */
export class SseDecoder {
  /** Bytes seen since the last complete line, plus any held trailing `\r`. */
  private pending = "";

  /** `data:` lines of the event currently being accumulated. */
  private data: string[] = [];

  /**
   * Feed one chunk. Returns the payload of every event COMPLETED by it, in
   * order — usually zero or one, more when a chunk carries several frames.
   */
  push(chunk: string): string[] {
    this.pending += chunk;

    const events: string[] = [];
    for (;;) {
      const terminator = /\r\n|\n|\r/.exec(this.pending);
      if (terminator === null) break;
      // The held `\r` — see the note at the top of this file. Acting on it now
      // would be guessing which terminator this is before the bytes that decide
      // it have arrived.
      if (terminator[0] === "\r" && terminator.index === this.pending.length - 1) break;

      const line = this.pending.slice(0, terminator.index);
      this.pending = this.pending.slice(terminator.index + terminator[0].length);

      const event = this.consumeLine(line);
      if (event !== null) events.push(event);
    }
    return events;
  }

  /** The completed event this line dispatched, or `null` if it dispatched none. */
  private consumeLine(line: string): string | null {
    if (line.length === 0) {
      if (this.data.length === 0) return null;
      const payload = this.data.join("\n");
      this.data = [];
      return payload;
    }

    if (line.startsWith(":")) return null;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== "data") return null;

    const rest = colon === -1 ? "" : line.slice(colon + 1);
    this.data.push(rest.startsWith(" ") ? rest.slice(1) : rest);
    return null;
  }
}
