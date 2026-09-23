import { VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH } from "../../../vibe-wire-types";

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
export function parseGrepFlag(raw: string | undefined): string | undefined {
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
