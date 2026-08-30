/**
 * The command that reads the NEXT page of `nexus tracks list`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 A PRINTED COMMAND IS AN INSTRUCTION, AND AN INSTRUCTION THAT REFUSES IN THE
 *    READER'S HANDS IS WORSE THAN NO INSTRUCTION AT ALL.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A dead end is visibly a dead end. A command that looks authoritative and then
 * errors costs the reader the time to paste it, read the failure, and work out
 * which half lied. Both ways this can happen were shipped in the first draft of
 * this footer and caught in review:
 *
 * ── 1. THE CURSOR FINGERPRINTS THE FILTERS, SO THEY MUST TRAVEL WITH IT ──────
 *
 * `encodeTrackListCursor` stamps `status.archived.nextOwner` into the token, and
 * `decodeTrackListCursor` compares that stamp against the filters of the request
 * REPLAYING it — a mismatch is a 400, deliberately, so a cursor cannot silently
 * resume inside a differently-filtered list.
 *
 * 🚨 OMITTING A FLAG IS A MISMATCH, NOT A NEUTRAL DEFAULT. An absent `--status`
 * fingerprints as `*`, which is a different string from `DONE`. So a footer that
 * printed the bare token refused on every page after a FILTERED one — the exact
 * case where paging matters most, because a filtered list is the long one
 * somebody is actually walking.
 *
 * ── 2. THE TOKEN CONTAINS `*`, AND ZSH TREATS THAT AS FATAL ─────────────────
 *
 * An omitted status or next-owner encodes as `*`, so the DEFAULT cursor — the
 * one every unfiltered walk produces — looks like `50~*.exclude.*`. Unquoted in
 * zsh an unmatched glob is not a warning that passes the literal through, it is
 * `no matches found` and the command never runs. So the paste-unsafe case was
 * the common one rather than an edge.
 *
 * Quoted with a POSIX-safe escaper rather than a bare `'…'`. The token's charset
 * is pinned today by `TRACK_LIST_CURSOR` and holds no quote, so the naive form
 * would work — and it would keep working right up until the token format gained
 * one character, silently, in a string nothing type-checks.
 */

/** The filter flags a replay has to carry, exactly as the caller spelled them. */
export interface TrackListPageFlags {
  readonly limit?: number;
  readonly status?: string;
  readonly archived?: string;
  readonly nextOwner?: string;
}

/**
 * One argument, safe to paste into any POSIX shell.
 *
 * Single quotes suspend every expansion there is — glob, parameter, command —
 * and the only character they cannot contain is a single quote, which is closed,
 * escaped and reopened in the usual way.
 *
 * ⚠️ `.replace(/'/g, …)` RATHER THAN `.replaceAll`, WHICH IS ES2021 AND THIS
 * PACKAGE TARGETS ES2020. Vitest transpiles it happily, so the suite went green
 * and `tsc` was the only thing that objected — do not "modernise" it back.
 */
export const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * The full next-page command, filters carried and cursor quoted.
 *
 * `--limit` is carried even though it is NOT part of the fingerprint: leaving it
 * off would silently change the page size mid-walk, which is a different answer
 * rather than an error and so the worse of the two failures.
 */
export function trackListNextPageCommand(flags: TrackListPageFlags, nextCursor: string): string {
  const parts = ["nexus tracks list"];

  if (flags.limit !== undefined) parts.push(`--limit ${flags.limit}`);
  if (flags.status !== undefined) parts.push(`--status ${flags.status}`);
  if (flags.archived !== undefined) parts.push(`--archived ${flags.archived}`);
  if (flags.nextOwner !== undefined) parts.push(`--next-owner ${flags.nextOwner}`);

  parts.push(`--cursor ${shellQuote(nextCursor)}`);

  return parts.join(" ");
}
