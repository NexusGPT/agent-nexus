/**
 * THE VOCABULARY THE RACE CHECK AND THE THREAD PLANNER SHARE.
 *
 * Declared in a leaf that imports nothing, so `id-graph.thread.ts` can name a
 * threaded id without depending on the race module and so neither file has to
 * re-declare it. `id-graph.race.ts` carries the reasoning — why a `not-found`
 * is re-checked at all, and why `unmeasured` is loud.
 */

/** One id this run actually passed to a leaf, and where it came from. */
export interface ThreadedId {
  /** The route's own spelling of the param, e.g. `agentId`. */
  readonly param: string;
  /** The producer leaf that published it, e.g. `agent list`. */
  readonly producer: string;
  /** The id as passed on the command line. */
  readonly id: string;
}

export type RaceVerdict =
  /** At least one threaded id is provably gone from its producer. */
  | { readonly kind: "vanished"; readonly gone: readonly ThreadedId[] }
  /** Every threaded id is still published by its producer. */
  | { readonly kind: "still-listed" }
  /** Absence could not be established. Never a reason to retire a red. */
  | { readonly kind: "unmeasured"; readonly why: string };
