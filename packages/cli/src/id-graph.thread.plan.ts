import type { LeafOutcome } from "./id-graph.outcome";
import type { ThreadedId } from "./id-graph.race.types";

/**
 * WHAT A THREAD PLAN IS. Types only, in a leaf that imports no planner, so the
 * planner and the blocked-reason helpers can both name the shape without either
 * importing the other. `id-graph.thread.ts` carries the reasoning.
 */

/** What to invoke a leaf with, or the verdict that stops it being invoked. */
export type ThreadPlan =
  | {
      readonly kind: "ready";
      readonly args: readonly string[];
      readonly threaded: readonly ThreadedId[];
    }
  | { readonly kind: "blocked"; readonly status: LeafOutcome; readonly note: string };

/**
 * The arm that stops a leaf being invoked.
 *
 * Named so a helper that only ever produces a refusal says so in its return
 * type, and a caller cannot hand one back where a `ready` plan was expected.
 */
export type BlockedThread = Extract<ThreadPlan, { kind: "blocked" }>;
