/**
 * WHICH CHECK-SHAPED VERBS PRINT A VERDICT AND EXIT 0 ANYWAY — DERIVED, NOT LISTED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A VERB WHOSE WHOLE JOB IS TO ANSWER "IS THIS GOOD" MUST BE ABLE TO SAY NO WITH
 * ITS EXIT CODE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus auth status` read local config, found a key, and exited `0` — over a key
 * the API had already stopped accepting. A sweep gated its preflight on that exit
 * code, passed, and then watched 63 of 69 calls fail on auth. NEX-4209 fixed that
 * one verb.
 *
 * It is not one verb. It is a SHAPE, and the shape is what this scan measures:
 *
 *     const result = await client.skills.testExternalTool(id, body);
 *     printRecord(result);          // result.status is "success" | "error"
 *                                   // …and the process exits 0 either way
 *
 * That is `external-tool test`. Forty-five lines above it, `external-tool
 * test-auth` calls THE SAME SDK METHOD, reads THE SAME `status` field, and maps
 * the failing arm to `reportFailure`. The correct shape and the broken one sit in
 * one file, and nothing in the build could tell them apart.
 *
 * ⚠️ THE COST IS NOT "A USELESS COMMAND". IT IS A COMMAND THAT LIES TO A SCRIPT.
 * `channel setup`'s own `--help` publishes the workaround —
 * `--json | jq -e '.ready'` — which is the admission, in the product's own
 * documentation, that its exit code cannot be believed. A published workaround is
 * what this class looks like from the inside.
 *
 * ── THE TWO HALVES OF THE POPULATION, AND WHY BOTH ARE NEEDED ───────────────
 *
 * 🚨 "PRINTS A FIELD CALLED `status`" IS NOT THE CLASS, AND A SCAN BUILT ON IT
 * ALONE REPORTS EVERY `get` IN THE CLI. `agent get` prints an agent whose
 * `status` is `DRAFT | PUBLISHED`. That is an ATTRIBUTE of a record the command
 * was asked to show — the command judged nothing, so there is nothing for it to
 * exit non-zero over, and demanding one would be absurd.
 *
 * So a finding needs BOTH halves:
 *
 *   1. **the VERB declares itself a check** — its leaf name is in
 *      {@link CHECK_VERBS}. `status`, `validate`, `test`, `diagnose`, `setup`,
 *      `connection-status`, … A reader typing one of these has asked a
 *      yes/no question, and the answer is what they will branch on;
 *   2. **the ANSWER is emitted** — some sink is handed a value whose declared
 *      type carries a field in {@link VERDICT_FIELDS}.
 *
 * A leaf with both, and no exit path governed by that answer, is a finding.
 *
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the scanner's DOCUMENT and its public surface. The rule bodies
 * live beside it in `status-verdict/`, one concern per file:
 *
 *   · `vocabularies.ts`         the two judgement lists, {@link CHECK_VERBS}
 *                               and {@link VERDICT_FIELDS};
 *   · `finding.ts`              the finding shape, its key, and the scan root;
 *   · `verdict-shape.ts`        is a type BRANCHABLE, and what counts as a sink;
 *   · `leaf-of.ts`              which leaf a `.action(...)` belongs to;
 *   · `derivation.ts`           the shallow dataflow the coverage test needs;
 *   · `exit-path.ts`            what counts as an exit, and what governs it;
 *   · `emitted-verdicts.ts`     RULE 1, half one — what verdict is emitted;
 *   · `covered-verdicts.ts`     RULE 1, half two — which emissions govern an exit;
 *   · `verdicts-without-exit.ts` RULE 1's driver, and its blind-spot list;
 *   · `check-verb-emissions.ts` RULE 2, the anti-vacuity population.
 *
 * 🚨 TWO RULES, ONE DUPLICATED TRAVERSAL. `emitted-verdicts.ts` and
 * `check-verb-emissions.ts` walk the same sinks through the same four filters
 * and differ only in what they keep at the end. They are NOT merged: converging
 * two scanners changes what each reports, and the split that produced these
 * files was a pure move. The duplication is recorded at both sites.
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. Re-exporting every part's helper because
 * the barrel can reach it would widen this module's public surface under cover
 * of a refactor — which is a behaviour change nothing in a green suite reports.
 * A part that needs a sibling's helper imports it directly.
 */

export { scanCheckVerbEmissions } from "./status-verdict/check-verb-emissions";
export { defaultScanRoot, verdictKey, type VerdictWithoutExit } from "./status-verdict/finding";
export { isVerdictShaped } from "./status-verdict/verdict-shape";
export { scanVerdictsWithoutExit } from "./status-verdict/verdicts-without-exit";
export { CHECK_VERBS, VERDICT_FIELDS } from "./status-verdict/vocabularies";
