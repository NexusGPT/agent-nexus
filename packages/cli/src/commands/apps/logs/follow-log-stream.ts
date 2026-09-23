import { SseDecoder } from "../../../util/sse-decode";
import type { VibeLogLineDto } from "../../../vibe-wire-types";
import type { FollowOutcome } from "./follow-outcome";
import { parseStreamFrame } from "./parse-stream-frame";

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Drive a follow to its end.
 *
 * Takes an iterable of raw text chunks rather than a URL, so a test can express
 * every case that matters — a frame split across two chunks, two frames in one,
 * a keepalive comment between them, an abort mid-stream, an upstream close, a
 * stream that just stops — without a socket.
 *
 * The abort is checked in TWO places and both are real. A live `fetch` body
 * throws when its signal fires, which the `catch` handles; a producer that
 * yields without ever awaiting the socket does not, which the top-of-loop check
 * handles. Neither one alone covers Ctrl-C.
 */
export async function followLogStream(
  chunks: AsyncIterable<string>,
  signal: AbortSignal,
  onLines: (lines: readonly VibeLogLineDto[]) => void
): Promise<FollowOutcome> {
  const decoder = new SseDecoder();

  try {
    for await (const chunk of chunks) {
      if (signal.aborted) return { kind: "interrupted" };

      for (const payload of decoder.push(chunk)) {
        const parsed = parseStreamFrame(payload);
        if (parsed.status === "malformed") {
          return { kind: "stream-error", message: parsed.reason };
        }
        if (parsed.status === "ignored") continue;

        const frame = parsed.frame;
        if (frame.type === "lines") {
          onLines(frame.lines);
          continue;
        }
        if (frame.type === "error") {
          return { kind: "stream-error", message: frame.message };
        }
        return { kind: "upstream-closed" };
      }
    }
  } catch (err) {
    if (signal.aborted || isAbortError(err)) return { kind: "interrupted" };
    return {
      kind: "stream-error",
      message: err instanceof Error ? err.message : String(err)
    };
  }

  // Fell off the end of the iterable. Either the caller aborted between chunks,
  // or the connection went away without the server saying goodbye.
  return signal.aborted ? { kind: "interrupted" } : { kind: "disconnected" };
}
