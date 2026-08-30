import { describe, expect, it } from "vitest";

import { readySetLimitAccepted } from "./ready-set-ceiling.conformance";
import { READY_SET_CEILING } from "./util/track-blockers.render";

/**
 * `READY_SET_CEILING` MUST BE EXACTLY THE LARGEST LIMIT THE CONTRACT ACCEPTS.
 *
 * `tracks task why-not-ready` asks for the ready set AT the ceiling so its
 * cross-check is about the WHOLE set rather than a default page of 50, and then
 * reads `tasks.length >= READY_SET_CEILING` as "the server's answer was
 * truncated, so a shorter reconstruction is not a disagreement".
 *
 * Both halves rest on that number being right, and they fail in opposite
 * directions — which is why this is asserted from BOTH sides rather than as a
 * single equality:
 *
 *   - TOO HIGH and the request is refused outright with a 400. Loud, but it
 *     breaks the command on every call.
 *   - TOO LOW and nothing is refused at all. The command silently cross-checks
 *     against a partial ready set and prints "the server and this reconstruction
 *     name DIFFERENT ready sets" on a healthy board — a false alarm from the one
 *     command whose entire value is being trusted about a stuck board. That is
 *     worse than the defect it would be reporting.
 *
 * `ready-set-ceiling.conformance.ts` carries why this is a pin rather than an
 * import, and — more importantly — the one divergence it cannot see.
 */
describe("the CLI's ready-set ceiling is the contract's ceiling", () => {
  it("CONTROL: the probe can tell an accepted limit from a refused one", () => {
    // Without this, a conformance helper that returned `false` for everything
    // would satisfy the "one above is refused" assertion below while the "the
    // ceiling itself is accepted" one carried the whole gate — and a helper
    // returning `true` for everything would do the mirror. Both arms are real
    // only if the probe discriminates at all.
    expect({ one: readySetLimitAccepted(1), absurd: readySetLimitAccepted(1_000_000) }).toEqual({
      one: true,
      absurd: false
    });
  });

  it("accepts the ceiling the CLI actually asks for", () => {
    expect({
      limit: READY_SET_CEILING,
      accepted: readySetLimitAccepted(READY_SET_CEILING)
    }).toEqual({ limit: READY_SET_CEILING, accepted: true });
  });

  it("refuses one above it, so the CLI is asking for the WHOLE set", () => {
    // This is the arm that catches a ceiling left behind by a contract that
    // shrank — the silent, dangerous direction.
    expect({
      limit: READY_SET_CEILING + 1,
      accepted: readySetLimitAccepted(READY_SET_CEILING + 1)
    }).toEqual({ limit: READY_SET_CEILING + 1, accepted: false });
  });
});
