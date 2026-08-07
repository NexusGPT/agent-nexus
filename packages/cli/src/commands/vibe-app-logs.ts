/**
 * `nexus vibe app logs <appId>` — read what a deployed app has printed, and
 * optionally keep reading.
 *
 * The command's whole body lives here rather than inline in `vibe.ts` for one
 * reason: almost none of it is about HTTP. Flag resolution, the SSE frame
 * vocabulary, the terminal rules of a follow and the rendering are all pure
 * functions over values a test can hand them, and every acceptance criterion on
 * this ticket is a statement about one of them. The action in `vibe.ts` is the
 * thin part — it resolves options, opens a socket and prints.
 *
 * ## Two endpoints, two shapes, one command
 *
 * The page read rides `ZVibe` and returns the usual `{ success, data }` envelope,
 * so it goes through `tenantRequest` like every other Vibe read. The follow is
 * deliberately OUTSIDE that surface — a `text/event-stream` carrying data-only
 * frames, no envelope, no generated client — so it goes through `tenantStream`.
 * There is no symmetry to assume between them and this module does not pretend
 * there is.
 *
 * ## NDJSON in BOTH modes, never a JSON array
 *
 * An array cannot be emitted incrementally: its closing bracket only exists once
 * the stream ends, and a follow does not end. `--follow --json | jq` would hang
 * forever. So `--json` emits one object per line in both modes, and the shape a
 * consumer parses does not change under them depending on which flags they
 * passed. This differs from every other `--json` surface in the CLI, and it is
 * the difference the ticket asks for.
 */

import { color, isJsonMode } from "../output";
import { resolveLogWindow } from "../util/log-window";
import { SseDecoder } from "../util/sse-decode";
import { type TenantHttpOptions, tenantStream } from "../util/tenant-http";
import {
  isVibeLogColor,
  VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH,
  VIBE_LOG_WIRE_MAX_LIMIT,
  type VibeAppLogStreamFrame,
  type VibeLogColor,
  type VibeLogLineDto
} from "../vibe-wire-types";

/** How far back a read goes when the caller does not say. */
export const VIBE_LOG_CLI_DEFAULT_SINCE = "1h";

/** Lines per read when the caller does not say. */
export const VIBE_LOG_CLI_DEFAULT_LIMIT = 200;

/**
 * The most lines one read will ask for.
 *
 * STRICTER than the server's own `VIBE_LOG_WIRE_MAX_LIMIT` (5000) on purpose, and
 * the two are separate numbers rather than one shared ceiling. A terminal is not
 * a log viewer: five thousand lines is a scrollback nobody reads, and the honest
 * answer to wanting more of them is `--json` into a file. The server refuses
 * independently at its own, higher, number — so both layers refuse, and the
 * CLI's refusal is the one a user actually meets.
 */
export const VIBE_LOG_CLI_MAX_LIMIT = 1000;

/** What the caller typed. Every field is raw, exactly as commander hands it over. */
export interface AppLogsFlags {
  since?: string;
  until?: string;
  color?: string;
  grep?: string;
  limit?: string;
  follow?: boolean;
}

/** A resolved, validated request. `to` is absent for a follow — a follow's end is always now. */
export interface AppLogsRequest {
  from: number;
  to?: number;
  color?: VibeLogColor;
  contains?: string;
  limit: number;
  follow: boolean;
}

/**
 * Flags → a request the endpoints will accept, or an `Error` naming what is
 * wrong with them.
 *
 * `now` is a parameter so the whole of this is testable without freezing a
 * clock. Everything it refuses is refused BEFORE any socket is opened: a local
 * message that names the flag beats a server 400 that names a field.
 */
export function resolveAppLogsRequest(flags: AppLogsFlags, now: number): AppLogsRequest {
  const follow = flags.follow === true;

  // Refused rather than resolved by precedence. Silently ignoring one of them
  // would leave a caller believing they had bounded a stream that is unbounded.
  if (follow && flags.until !== undefined) {
    throw new Error(
      "--follow cannot be combined with --until: a follow runs until you stop it, so it has no end instant. Drop one of the two."
    );
  }

  const window = resolveLogWindow(flags.since ?? VIBE_LOG_CLI_DEFAULT_SINCE, flags.until, now);

  return {
    from: window.from,
    to: follow ? undefined : window.to,
    color: parseColorFlag(flags.color),
    contains: parseGrepFlag(flags.grep),
    limit: parseLimitFlag(flags.limit),
    follow
  };
}

/**
 * `--color blue|green`, case-insensitively.
 *
 * Accepted in either case and always SENT lower-case: the database enum spells
 * these `BLUE`/`GREEN`, so an operator who has read a deployment record will
 * reasonably type the upper-case form, while the value the log store indexes is
 * lower-case. Matching on the wrong case matches nothing, silently — which is
 * the failure this normalisation exists to make unreachable.
 */
function parseColorFlag(raw: string | undefined): VibeLogColor | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (!isVibeLogColor(normalized)) {
    throw new Error(`--color must be blue or green (got "${raw}").`);
  }
  return normalized;
}

/**
 * `--grep` — a LITERAL substring, and nothing here ever treats it otherwise.
 *
 * The value is passed through byte for byte. It is never compiled, never
 * escaped, never inspected for metacharacters: the gateway composes the query
 * itself and uses this only as an escaped literal operand, so a `.` matches a
 * dot and a `.*` matches those two characters. The only checks are that it is
 * non-empty and within the length the server accepts — refused here so a needle
 * one character too long costs a message rather than a round trip.
 */
function parseGrepFlag(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw.length === 0) {
    throw new Error("--grep needs a non-empty substring.");
  }
  if (raw.length > VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH) {
    throw new Error(
      `--grep must be at most ${String(VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH)} characters (got ${String(raw.length)}).`
    );
  }
  return raw;
}

function parseLimitFlag(raw: string | undefined): number {
  if (raw === undefined) return VIBE_LOG_CLI_DEFAULT_LIMIT;

  // `Number("")` and `Number("  ")` are BOTH 0 — an integer — so an empty flag
  // would otherwise sail past the shape check and be reported as a bound
  // problem: `--limit must be between 1 and 1000 (got )`, which names neither
  // what was typed nor what is wrong with it. Refused here as the typo it is.
  const trimmed = raw.trim();
  const parsed = trimmed.length === 0 ? Number.NaN : Number(trimmed);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--limit must be a whole number (got "${raw}").`);
  }
  if (parsed < 1 || parsed > VIBE_LOG_CLI_MAX_LIMIT) {
    throw new Error(
      `--limit must be between 1 and ${String(VIBE_LOG_CLI_MAX_LIMIT)} (got ${raw}).`
    );
  }
  return parsed;
}

/** The query string both endpoints read. The follow's contract carries no `to`. */
export function toLogQuery(request: AppLogsRequest): Record<string, string | number | undefined> {
  return {
    from: request.from,
    to: request.to,
    color: request.color,
    contains: request.contains,
    limit: request.limit
  };
}

// ============================================================
// Rendering
// ============================================================

/**
 * A page arrives NEWEST FIRST; a terminal reads oldest first.
 *
 * Reversed for display so time runs down the screen the way `tail` has taught
 * everyone to expect, and so a page followed by `--follow` output is one
 * continuous chronology instead of a reversal followed by a forward run. The
 * wire order is untouched — this is a rendering decision and `nextCursor` paging
 * is unaffected, since a read asks for one page.
 *
 * `--json` gets the same order for the same reason: the whole point of emitting
 * NDJSON in both modes is that what you see and what you pipe do not disagree.
 */
export function orderForDisplay(lines: readonly VibeLogLineDto[]): VibeLogLineDto[] {
  return [...lines].reverse();
}

/** One human-readable line: instant, slot, message. */
export function formatLogLine(line: VibeLogLineDto): string {
  const slot = line.color === null ? "" : ` ${color.dim(`[${line.color}]`)}`;
  return `${color.dim(line.timestamp)}${slot} ${line.message}`;
}

/**
 * Print lines, in whichever mode is active.
 *
 * Everything here goes to stdout and NOTHING else does — notes, warnings and
 * failures are stderr, so `--json` on stdout stays a clean NDJSON stream that a
 * consumer can pipe without filtering.
 */
export function emitLogLines(lines: readonly VibeLogLineDto[]): void {
  if (isJsonMode()) {
    for (const line of lines) console.log(JSON.stringify(line));
    return;
  }
  for (const line of lines) console.log(formatLogLine(line));
}

// ============================================================
// The follow
// ============================================================

/**
 * What one SSE payload turned out to be.
 *
 * Three outcomes rather than a nullable frame, because they call for three
 * different actions and collapsing any two of them loses information the caller
 * needs. `ignored` is a well-formed frame carrying a `type` this build does not
 * know — a newer server is allowed to add one, and a CLI that treated that as a
 * protocol break would refuse to follow logs after every backend deploy.
 * `malformed` is genuinely not the contract, and is terminal.
 */
export type StreamFrameParse =
  | { status: "frame"; frame: VibeAppLogStreamFrame }
  | { status: "ignored" }
  | { status: "malformed"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLogLine(value: unknown): value is VibeLogLineDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.timestampNs === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.message === "string" &&
    (value.color === null || typeof value.color === "string")
  );
}

/**
 * One `data:` payload → a frame.
 *
 * Narrowed by inspection rather than declared by a cast: this is a trust
 * boundary, the bytes come off a socket, and a type assertion here would be a
 * claim about data nobody has looked at. The reward is that every downstream
 * consumer of a `lines` frame gets a real `VibeLogLineDto[]`.
 */
export function parseStreamFrame(payload: string): StreamFrameParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return { status: "malformed", reason: "the log stream sent a frame that is not JSON" };
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return { status: "malformed", reason: "the log stream sent a frame with no type" };
  }

  if (parsed.type === "lines") {
    if (!Array.isArray(parsed.lines) || !parsed.lines.every(isLogLine)) {
      return {
        status: "malformed",
        reason: "the log stream sent a lines frame with unreadable lines"
      };
    }
    return { status: "frame", frame: { type: "lines", lines: parsed.lines } };
  }

  if (parsed.type === "end") {
    if (parsed.reason !== "upstream-closed") return { status: "ignored" };
    return { status: "frame", frame: { type: "end", reason: "upstream-closed" } };
  }

  if (parsed.type === "error") {
    if (typeof parsed.message !== "string") {
      return { status: "malformed", reason: "the log stream sent an error frame with no message" };
    }
    return { status: "frame", frame: { type: "error", message: parsed.message } };
  }

  return { status: "ignored" };
}

/**
 * Why a follow stopped. Every one of these is reported; none of them is silent.
 *
 * `disconnected` is the one that earns its place. A stream that ends without a
 * terminal frame is a dropped connection — a proxy timing out, a laptop lid, a
 * network blip — and it looks EXACTLY like a quiet app whose tail simply
 * finished. Rendering it as a clean end would tell a user their app printed
 * nothing more when the truth is nobody was listening.
 */
export type FollowOutcome =
  | { kind: "upstream-closed" }
  | { kind: "interrupted" }
  | { kind: "stream-error"; message: string }
  | { kind: "disconnected" };

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

/**
 * The message for a follow that ended badly, or `null` when it ended fine.
 *
 * Returned rather than printed so the caller can `throw new Error(...)` and let
 * `handleError` render it — one error shape for the whole CLI, `--json` included,
 * instead of a second printer that would drift from the first.
 */
export function describeFollowFailure(outcome: FollowOutcome): string | null {
  switch (outcome.kind) {
    case "stream-error":
      return `The log stream stopped: ${outcome.message}`;
    case "disconnected":
      // Named as a fact about the CONNECTION, never as a fact about the app.
      // "no more logs" is precisely what this is not.
      return "The log stream ended without closing — the connection dropped. Any lines printed above are what arrived before it did.";
    case "upstream-closed":
    case "interrupted":
      return null;
  }
}

/**
 * The one note a successful follow prints, on stderr.
 *
 * `upstream-closed` is the tenant gateway hitting its own duration cap. Nothing
 * is wrong and nothing was lost — but a stream that simply stops with no word
 * reads as a hang, so it says so and says what to do. Ctrl-C prints nothing:
 * the user knows what they just did.
 */
export function noteFollowEnd(outcome: FollowOutcome): void {
  if (outcome.kind !== "upstream-closed") return;
  if (isJsonMode()) return;
  console.error(
    color.dim("The gateway closed the follow (its own duration cap). Re-run to keep following.")
  );
}

/**
 * Open the follow, print it, and tear it down on every path out.
 *
 * ## Ctrl-C
 *
 * Installing a `SIGINT` listener REPLACES Node's default terminate, which is the
 * only way a stop can be clean: the abort reaches the socket, the reader is
 * cancelled, and the process exits 0 with no stack trace and no connection left
 * open. It also means a follow that failed to unwind would hang instead of
 * dying, so a SECOND Ctrl-C exits hard — the escape hatch costs three lines and
 * its absence would be a wedged terminal.
 *
 * `SIGTERM` is handled the same way, so a supervisor stopping this gets the same
 * clean teardown a person does.
 *
 * ## Why `finally` aborts as well
 *
 * Every exit from this function must release the socket, including the ones
 * nobody planned: a throw inside the render callback, a malformed frame, an
 * unexpected error. `abort()` is idempotent, so calling it on the happy path
 * costs nothing and calling it on every other path is the whole guarantee.
 *
 * Frames carry their lines OLDEST FIRST — a follow moves forward — so unlike the
 * page read there is nothing to reverse here.
 */
export async function runAppLogsFollow(
  opts: TenantHttpOptions,
  appId: string,
  request: AppLogsRequest
): Promise<number> {
  const controller = new AbortController();
  let interrupts = 0;
  const onInterrupt = (): void => {
    interrupts += 1;
    if (interrupts > 1) process.exit(130);
    controller.abort();
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);

  try {
    let chunks: AsyncIterable<string>;
    try {
      chunks = await tenantStream(opts, {
        path: `/api/vibe/apps/${encodeURIComponent(appId)}/logs/stream`,
        query: toLogQuery(request),
        signal: controller.signal
      });
    } catch (err) {
      // Ctrl-C landed before the headers did. That is a deliberate stop, not a
      // connection failure, and reporting it as one would print an error for
      // something the user chose.
      if (controller.signal.aborted) return 0;
      throw err;
    }

    const outcome = await followLogStream(chunks, controller.signal, emitLogLines);
    const failure = describeFollowFailure(outcome);
    if (failure !== null) throw new Error(failure);
    noteFollowEnd(outcome);
    return 0;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    controller.abort();
  }
}

/** Named so the help text and the refusal message cannot drift from the ceiling. */
export const VIBE_LOG_CLI_LIMIT_HELP = `Lines to read (1–${String(VIBE_LOG_CLI_MAX_LIMIT)}). Default ${String(VIBE_LOG_CLI_DEFAULT_LIMIT)}. The server's own ceiling is ${String(VIBE_LOG_WIRE_MAX_LIMIT)}.`;
