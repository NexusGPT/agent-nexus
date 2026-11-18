/**
 * DECLARED DISPOSITIONS, `tracks task why-not-ready` … `tracks event append`.
 *
 * ONE SLICE of the single table `./command-classification.ts` assembles. DATA,
 * and nothing else: one `"<path>": "<disposition>"` line per leaf, held in the
 * order the table has always carried them, so which slice a leaf sits in is
 * invisible to every reader of `COMMAND_CLASSIFICATION`.
 *
 * WHAT BELONGS HERE: a leaf whose path falls inside the span above, with a
 * comment where its disposition is surprising. The promotion rules live on
 * `COMMAND_CLASSIFICATION` itself, so there is exactly one copy of them.
 *
 * WHAT DOES NOT: logic of any kind, and no second table —
 * `./sweep-expected-skips.ts` answers what one ENVIRONMENT does, which is a
 * different question from what may be done with a leaf.
 *
 * ⚠️ FILING A LEAF IN THE WRONG SLICE COSTS TIDINESS AND NOTHING ELSE, because
 * the assembler unions them. DECLARING ONE LEAF IN TWO SLICES THROWS, and that
 * refusal is what replaces the `ts(1117)` a single object literal used to get
 * from the compiler for free.
 */

import type { CommandDisposition } from "./disposition";

/** 14 leaves, `tracks task why-not-ready` … `tracks event append`. */
export const TRACKS_TASK_AND_EVENTS: Readonly<Record<string, CommandDisposition>> = {
  // Read-only — three GETs and no write — but it takes a required `<trackId>`,
  // so the sweep can assert it is registered and cannot invoke it. Same reason
  // `tracks task ready` sits here rather than under `safe`.
  "tracks task why-not-ready": "registration-only",
  "tracks plan import": "registration-only",
  "tracks agent list": "registration-only",
  "tracks agent open": "registration-only",
  "tracks agent beat": "registration-only",
  "tracks agent close": "registration-only",
  "tracks diary list": "registration-only",
  "tracks diary append": "registration-only",
  "tracks memory list": "registration-only",
  "tracks memory put": "registration-only",
  "tracks memory delete": "registration-only",
  "tracks event list": "registration-only",
  // Takes no argument, emits `--json`, and answers 200 — the shape of a `safe`
  // leaf, and it is held back by a SCOPE rather than by its shape. It needs
  // `track_events:read`, which no swept leaf requires: `tracks ready` and
  // `tracks list` both need `tracks:read` and nothing more, so the sweep has
  // never established that its key carries the event scope at all. Promoting
  // this leaf on the shape alone bets the gate on that, and a key without it
  // answers 403 — which the skip grep does not match, so `CLI: Sweep` goes red
  // for a credential reason that looks like a CLI regression.
  //
  // So the promotion test here is not a route probe. It is a scope probe, and
  // the control is the key the sweep itself uses rather than a human's:
  //
  //   nexus tracks event feed --limit 1 --json       # 200 under the CI key
  //   nexus tracks ready --json                      # control — already swept
  //
  // Both 200 under the SAME credential and this becomes `safe`.
  "tracks event feed": "registration-only",
  "tracks event append": "registration-only"
};
