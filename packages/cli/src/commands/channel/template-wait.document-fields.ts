/**
 * THE WAITING FIELDS EVERY `--wait` DOCUMENT IN THIS DIRECTORY CARRIES.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ONE SITE, BECAUSE THREE THAT AGREE TODAY IS A CONVENTION AND NOT A FIX
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three verbs hand work to a system that finishes somewhere else — Meta's
 * template review for `create --submit` and `submit-approval`, Twilio's delivery
 * for `test-send` — and each optionally holds the terminal while
 * `pollForTerminalState` asks. Each then wrote its own answer to "what became of
 * the wait", and the three disagreed:
 *
 *   · `submit-approval` emitted `waited` and `timedOut`.
 *   · `test-send`       emitted `waited` alone, so a script could not tell a
 *                       resolved wait from an abandoned one.
 *   · `create --submit` emitted neither, so it could tell neither.
 *
 * A consumer therefore could not ask one question of all three. Correcting the
 * two laggards in place would leave three copies that happen to agree, and the
 * defect was never that they disagreed on a particular day — it is that nothing
 * stopped them. Every caller routes through here, so the shapes cannot diverge
 * again without deleting this file.
 *
 * ── WHAT CONVERGES ────────────────────────────────────────────────────────────
 *
 * `timedOut` on an approval and `timedOut` on a delivery are the SAME fact: a
 * bounded poll spent its budget with the status it reports still moving. That is
 * a property of the POLL — literally the same `pollForTerminalState` loop in all
 * three — and not of the domain, which is what makes one name honest for both.
 *
 * ⚠️ IT DOES NOT MEAN THE OPERATION FAILED, AND THE NEXT STEP DIFFERS BY VERB. A
 * timed-out approval is still under review; a timed-out delivery is still in
 * transit. Neither is an error, and both are resumed by asking again —
 * `approvals` for the first, the message SID for the second.
 *
 * It is not exit 0 either, on the two verbs where `--wait` is a flag a caller
 * asked for: `template-wait.exit-category.ts` exits `timed-out` there, off these
 * same two booleans, so the number and this `wait` key cannot disagree.
 * `create --submit` polls unconditionally and still exits 0 on its own timeout.
 *
 * 🚨 THE TERMINAL VOCABULARY DOES NOT CONVERGE AND MUST NOT. `approved` /
 * `rejected` and `delivered` / `read` / `failed` / `undelivered` are different
 * alphabets. Each caller applies ITS OWN predicate and passes the answer as
 * `settled`; this file never sees a status string and has no way to grow an
 * opinion about one. Pulling those predicates in here is the false convergence
 * this shape sits one step away from.
 */

/**
 * Why a bounded `--wait` stopped, as the `--json` document states it.
 *
 * Three members and not four: a command that never waited cannot have timed out,
 * so the state a boolean pair can spell and reality cannot reach is absent here
 * by construction rather than merely unreachable.
 */
export type WaitDisposition = "not-requested" | "resolved" | "timed-out";

/** What a caller knows about its own wait. */
export interface WaitFacts {
  /** The poll actually ran. */
  readonly waited: boolean;
  /**
   * The verb's OWN terminal predicate says the status THIS DOCUMENT REPORTS is
   * settled.
   *
   * Read off the reported status rather than off "a probe watched it settle",
   * and the difference is not academic: a send that came back `failed` before
   * any probe ran is settled, and calling that a timeout sends a script back to
   * wait on a message that is already dead. The status is what the consumer
   * reads, so the status is what this field has to describe.
   */
  readonly settled: boolean;
}

/**
 * The three waiting keys, derived once from the two facts a caller holds.
 *
 * Both parameters are booleans, so they are passed by NAME: transposed
 * positionally they type-check and invert the document.
 */
export function waitDocumentFields(facts: WaitFacts): Record<string, unknown> {
  const wait: WaitDisposition = !facts.waited
    ? "not-requested"
    : facts.settled
      ? "resolved"
      : "timed-out";

  return {
    wait,
    // debt: `waited` and `timedOut` are the pre-convergence pair, kept because
    //       `--json` is a published contract and a dropped key reads as
    //       `undefined` in a consumer's `if`, which silently takes the other
    //       branch — the one failure direction nothing reports.
    //       Ceiling: two keys and no state. Both are DERIVED from `wait` here
    //       and nowhere else, so neither can drift from it.
    //       Upgrade trigger: the next MAJOR of `@agent-nexus/cli`, where
    //       removing a published `--json` key is permitted.
    waited: wait !== "not-requested",
    timedOut: wait === "timed-out"
  };
}
