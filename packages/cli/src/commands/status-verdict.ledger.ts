/**
 * THE CHECK-SHAPED VERBS THAT EXIT 0 OVER THEIR OWN VERDICT. THE TABLE IS EMPTY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SHRINK-ONLY. AN ENTRY MAY BE DELETED. ONE MAY NOT BE ADDED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `status-verdict.scan.ts` derives this population from the type checker. Every
 * site it finds must appear below, or `status-verdict.test.ts` fails. The table
 * held thirteen entries when the gate landed and holds NONE now — every one of
 * those commands carries its verdict in its exit code, so a NEW one turns the
 * build red on the day it is written, named by file, receiver, command and
 * field.
 *
 * 🚨 AN EMPTY LEDGER IS THE SUCCESS STATE, AND IT IS NOT A DEAD GATE. What the
 * table did while it had rows was keep the number MEASURED rather than
 * remembered, stop it growing while nobody was looking, and make each survivor
 * carry the reason it survived. What survives the drain is the SCAN, which still
 * runs on every build against the real `src/`.
 *
 * ── DRAINING IS SILENTLY LEGAL, AND THAT IS WHY THERE IS ANYTHING LEFT ──────
 *
 * 🔴 THERE IS NO "THIS ENTRY IS STALE" ASSERTION, DELIBERATELY, AND ADDING ONE
 * WOULD HAVE DELETED THIS GATE ON THE LAST PULL REQUEST.
 *
 * "every ledger key must still be a finding" is a LOWER BOUND on draining data.
 * Under it, fixing one command reds the build until its entry goes in the same
 * edit, and the person who fixes the LAST one is left with a gate that refuses
 * its own success. This class was drained namespace by namespace, in five
 * separate pull requests all touching this one file; a lower bound would have
 * turned each into a conflict with a red build attached, which is how a gate
 * gets switched off.
 *
 * The two assertions that hold instead were safe under draining in both
 * directions, and are still the whole contract:
 *
 *   · **SUBSET** — every finding is a key here. With no keys, ANY finding is
 *     red. The assertion did not weaken as the table emptied; it got stricter.
 *   · **NON-GROWTH** — the number of keys never exceeds
 *     {@link STATUS_VERDICT_LEDGER_CEILING}, which is now `0`. Re-admitting a
 *     survivor means raising that line, in a diff a reviewer reads.
 *
 * ⚠️ THE SUITE'S OWN CONTROLS ARE WHAT MAKE AN EMPTY TABLE MEANINGFUL, and they
 * were built to survive exactly this moment: `status-verdict.test.ts` asserts
 * that the scan still REACHES check verbs emitting a verdict, and that at least
 * one real leaf is COVERED. Neither goes to zero when the findings do — a cured
 * leaf still emits its answer, it simply also exits over it — so a zero here
 * means the class is drained, and never that the walk broke. Every command
 * drained joined the population those controls measure, so they are stronger now
 * than on the day they were written.
 *
 * The table's row helper is kept below rather than deleted with the last row: a
 * new survivor needs somewhere to go, with its reason, and re-deriving the shape
 * from git history is how a ledger comes back as a comment nobody checks.
 *
 * ── WHAT THE CURE WAS, IN ONE PLACE, FOR THE NEXT ONE ───────────────────────
 *
 * `external-tool test-auth` did it first and every drained command followed it:
 *
 *     if (result.status === "success") {
 *       printRecord(result);
 *     } else {
 *       process.exitCode = reportFailure("remote-error", `… failed: …`, …);
 *     }
 *
 * Three things in that shape are load-bearing, and each was got wrong at least
 * once during the drain:
 *
 *   · **`remote-error`, not a refusal.** The invocation was ACCEPTED and the
 *     platform answered that the thing under test does not work. The caller's
 *     next move is to fix the subject, never the command line.
 *   · **THREE outcomes, never two.** A check that could not RUN — a node test
 *     dispatched to the background, a run somebody cancelled, an OAuth handshake
 *     still pending — is `unmeasured`, which `exit-codes.ts` declares as neither
 *     a failure nor a success. Collapsing it into either is this same defect one
 *     layer down.
 *   · **The RECORD is not printed before the refusal.** Under `--json` a failure
 *     is the error document and nothing else; taking stdout with the payload
 *     leaves a document that parses cleanly and never says the thing failed.
 *     Whatever the reader needs — the platform's message, an `errorCode`, a
 *     deadline, a checklist — travels INSIDE that document rather than being
 *     pointed at.
 */

/** One surviving verb, keyed as `verdictKey()` spells it. */
export interface LedgeredVerdict {
  /** `<file> <receiver>.<command> <field>` — see `verdictKey`. */
  readonly key: string;
  /** What a caller cannot currently tell from this command's exit code. */
  readonly note: string;
}

/**
 * The most keys this ledger may hold.
 *
 * ⚠️ AN UPPER BOUND, NEVER AN EQUALITY. An unrelated merge can leave this file
 * one entry short — it has happened twice on the sibling ledgers in this
 * package — and an equality check would red the build over a tree that is
 * strictly healthier than the one it was written against.
 *
 * It was lowered as each namespace drained, in the same commit, and it is 0 now:
 * ANY finding is red, by name. Raising it is the one edit that lets this class
 * grow back, and it is one line in a diff a reviewer reads.
 */
export const STATUS_VERDICT_LEDGER_CEILING = 0;

/**
 * EMPTY, and that is the finished state rather than a missing file.
 *
 * A new survivor is written here with its reason and the ceiling raised in the
 * same diff. `status-verdict.test.ts` reads this table through
 * `emptyTableIsExpected` precisely so an empty one is legal — under
 * `eachOrRefuse` the last drain would have failed the file at COLLECTION and
 * taken the subset arm and both anti-vacuity controls with it.
 */
export const STATUS_VERDICT_LEDGER: readonly LedgeredVerdict[] = [];
