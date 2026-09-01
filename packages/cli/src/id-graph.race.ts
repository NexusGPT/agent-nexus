import { exitCategoryFor } from "./exit-codes";
import { rowsFrom } from "./id-graph.ids";

/**
 * DID THE ROW VANISH UNDERNEATH US, OR IS THE ROUTE BROKEN? Both render as a
 * `not-found`, and they are opposites.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS EXISTS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sweep runs each producer ONCE and threads a row it saw into every consumer
 * of that producer. Those consumers then run over the following minute, against
 * a SHARED organisation that other jobs are writing to. `CLI: E2E flows` creates
 * an agent and a collection and deletes both in an `EXIT` trap, and it runs
 * concurrently from every PR. So the row the sweep threaded can be gone by the
 * time a consumer asks for it, and the consumer answers 404 — correctly.
 *
 * Measured across four `CLI: Sweep` runs: `12 reached · 2 failed`,
 * `10 reached · 4 failed`, and twice `14 reached · 0 failed`. A DIFFERENT id
 * every time. The two clean runs are the control: on one of them a concurrent
 * E2E run was in flight and in its CREATE phase; the two dirty runs both had one
 * end — i.e. tear down — inside the sweep's window. A concurrent writer is not
 * enough; the DELETE is what breaks it.
 *
 * The fingerprint that says "the row is gone" rather than "the route is broken":
 * on one id, `agent-tool list` answered 200 while `agent-collection list` and
 * `version list` answered 404. All three take the same `agentId`. The two that
 * 404 verify the agent exists first (`{ id, organizationId, deletedAt: null }`);
 * the one that passes does not verify at all. Same for the collection id, where
 * `collection documents` passed while `collection get` and `collection stats`
 * 404'd.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE CURE IS NOT TO TOLERATE A 404, AND IT IS NOT AN ORDERING TWEAK EITHER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Softening a `not-found` would delete the one signal this sweep exists to
 * produce: a live read that cannot find a row its own list route just published
 * is exactly the defect worth a red. And threading the OLDEST row instead of the
 * newest only makes the race RARER — it encodes a guess about which rows another
 * suite happens to churn, and it is still a row somebody can delete.
 *
 * So the verdict is decided by OBSERVATION, never by probability: ask the
 * producer again, and see whether the id we threaded is still listed.
 *
 *   VANISHED      the id is absent from a fresh read of the same producer. The
 *                 row was deleted between the two calls. Re-thread and retry.
 *   STILL-LISTED  the producer still publishes the id and the route still cannot
 *                 find it. That is the defect. FAILED, exactly as before.
 *   UNMEASURED    the re-read did not answer, so absence was never established.
 *                 FAILED — see the direction rule below.
 *
 * 🚨 THE DEFAULT DIRECTION IS FAILED, FOR THE SAME REASON
 * {@link import("./id-graph.refusal").isClientSideRefusal} DEFAULTS TO `false`.
 * A producer that errored, a body that will not parse, an envelope this reader
 * does not know — every one of them is `unmeasured`, and `unmeasured` is loud.
 * Only a body that PARSED AS A LIST and does not contain the id can retire a
 * red, because only that is evidence. A rule that guessed "probably raced" on
 * doubt would rebuild the false green in a different costume.
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

/**
 * Is this exit code the CLI's own `not-found`?
 *
 * Read off {@link import("./exit-codes").EXIT_CODES} rather than matching the
 * message, so it cannot drift from the taxonomy and cannot be fooled by a route
 * whose prose happens to say "not found". A 403, a 500 or a timeout is NOT this
 * and must never reach the re-check — the row's existence is not the question
 * those raise.
 */
export function isNotFound(code: number): boolean {
  return exitCategoryFor(code) === "not-found";
}

/**
 * The verdict on one leaf's `not-found`, given a fresh read of every producer
 * that fed it.
 *
 * `refreshed` maps a producer leaf path to the body of a FRESH `--json`
 * invocation, or to `undefined` when that invocation did not succeed. The caller
 * does the I/O; this function does the deciding, and is pure so a spec can reach
 * it — the runner it serves ends in `main()`, so nothing importable lives there.
 */
export function raceVerdict(
  threaded: readonly ThreadedId[],
  refreshed: ReadonlyMap<string, string | undefined>
): RaceVerdict {
  if (threaded.length === 0) {
    // A leaf that threaded nothing cannot have raced, so a not-found from one is
    // about the route. Reaching here at all would be a caller bug; say so rather
    // than returning a verdict that reads as measured.
    return { kind: "unmeasured", why: "the leaf threaded no id, so no row could have vanished" };
  }

  const gone: ThreadedId[] = [];
  for (const entry of threaded) {
    if (!refreshed.has(entry.producer)) {
      return {
        kind: "unmeasured",
        why: `producer \`${entry.producer}\` was not re-read`
      };
    }
    const body = refreshed.get(entry.producer);
    if (body === undefined) {
      return {
        kind: "unmeasured",
        why: `re-reading producer \`${entry.producer}\` did not succeed`
      };
    }
    const rows = rowsFrom(body);
    if (rows === undefined) {
      // Parsed-and-empty proves absence; unparseable proves nothing. See the
      // header, and `rowsFrom`'s own docblock for why the two are split there.
      return {
        kind: "unmeasured",
        why: `producer \`${entry.producer}\` answered with no readable row list`
      };
    }
    if (!listsId(rows, entry.param, entry.id)) gone.push(entry);
  }

  return gone.length > 0 ? { kind: "vanished", gone } : { kind: "still-listed" };
}

/**
 * Does any row publish `id` for `param`?
 *
 * The same field rule `idsFrom` threads by — the param's own name first, `id`
 * only as a fallback — because the question is whether THIS id would still be
 * threaded, not whether the string appears anywhere in the body. A substring
 * search over the whole body would answer yes for an id quoted inside an
 * unrelated field and turn a genuine race back into a red.
 */
function listsId(rows: readonly unknown[], param: string, id: string): boolean {
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    const picked = record[param] ?? record.id;
    if (picked === id) return true;
  }
  return false;
}
