/**
 * THE DESTRUCTIVE-CONFIRMATION GATE — derive the population, then DRIVE it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS DELETES, AND WHY THE OLD SHAPE COULD NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `destructive-confirmation.test.ts` asserts two real things: that no NEW
 * command declares `--yes` by hand, and that no command decides on stdout. Both
 * are conditioned on a command HAVING a `--yes`. Neither can see a destructive
 * command that declares no confirmation at all, because such a command is
 * absent from every population those assertions range over. A gate whose
 * predicate is "of the commands that confirm, do they confirm correctly" is
 * satisfied, vacuously and forever, by a command that never confirms.
 *
 * That file also derived a `notReadOnly()` population from
 * `COMMAND_CLASSIFICATION` and fed it nothing but a `length > 50` control. It
 * could not have fed it an obligation either: the classification's non-`safe`
 * bucket is 483 leaves and includes `agent get <id>` — a READ that happens to
 * need an argument. "Not read-only" is not "destructive", and asserting a
 * confirmation over that population would demand one from every parameterised
 * read in the CLI.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SO: A DERIVED CANDIDATE SET, PARTITIONED BY THREE NAMED SETS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Destructiveness cannot be derived from commander — nothing on a `Command`
 * says whether its action destroys anything. What CAN be derived is a set of
 * CANDIDATES that must each be accounted for by name:
 *
 *   {@link destructiveCandidates} = leaves whose name carries a verb from
 *   {@link DESTRUCTIVE_VERBS}  ∪  leaves that DECLARE `--yes`.
 *
 * The second half is what catches a command whose name says nothing —
 * `phone-number buy` spends money and destroys nothing, and is only a candidate
 * because it declares the flag. The first half is what catches a command that
 * declares nothing — which is the whole hole, and everything in
 * {@link UNCONFIRMED_DESTRUCTIVE} reached this file through it.
 *
 * Every candidate must appear in EXACTLY ONE of:
 *
 *   - {@link CONFIRMS_BEFORE_ACTING} — the OBLIGATION SET. Each member is
 *     DRIVEN with no terminal and no `--yes`, and must be observed to reach
 *     `confirmDestructive` and then stop. Not "declares a flag" — REACHES the
 *     helper. A flag is a declaration; a call is a fact.
 *   - {@link NOT_DESTRUCTIVE} — a candidate that legitimately does not confirm,
 *     with a written reason. Driven too, so a member that starts confirming is
 *     reported rather than silently over-exempted.
 *   - {@link UNCONFIRMED_DESTRUCTIVE} — a candidate that DOES destroy and does
 *     NOT confirm. Named debt. Driven, and required to still fail — an entry
 *     that starts confirming must move to the obligation set, so the ledger
 *     cannot rot in the shrinking direction either.
 *
 * 🚨 THE PARTITION IS THE GATE. A new `foo delete` is a candidate the moment it
 * is registered, is in none of the three sets, and reds by name. There is no
 * count floor anywhere in this module, deliberately: a floor is a hole shaped
 * exactly like the defect, because a mismatched item LEAVES the population and
 * takes its own case with it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS STRUCTURALLY CANNOT SEE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A destructive command that carries NO verb from the vocabulary AND declares
 * no `--yes`. `phone-number buy` is the proof that such a command can exist —
 * it is only in the population because somebody already gated it. A future
 * `billing charge` or `org transfer` would be invisible here.
 *
 * The vocabulary is the mitigation and not the cure: it is wide enough that
 * every destructive verb this CLI has ever shipped is in it, and every member
 * it over-matches costs one line in {@link NOT_DESTRUCTIVE} rather than a
 * loosened rule. Widening it is cheap; nothing else closes the shadow.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHERE EACH PART LIVES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file is the entry point and declares nothing of its own, so the one
 * import path every caller already uses keeps working:
 *
 *   `.verbs.ts`          the vocabulary, and the word-splitting rule
 *   `.candidates.ts`     the walk of the LIVE commander tree, and the union
 *   `.sets.ts`           the obligation set, and the reasoned exemptions
 *   `.debt.ts`           the measurement of what still destroys without asking
 *   `.argv.ts`           the argv that reaches an action with no consent in it
 *   `.candidate-run.ts`  what one drive reports, and what it needs to run
 *   `.drive-one.ts`      driving one candidate, streams and exit code captured
 *   `.run-scan.ts`       driving the whole population, once, in one pass
 *
 * 🔴 The population is still DERIVED and never enumerated by file: the split
 * moves no part of it into a path key, so a leaf registered in any file is a
 * candidate the moment the tree is built.
 */

export { argvWithoutConfirmation } from "./destructive-confirmation.argv";
export type { CandidateDeps, CandidateRun } from "./destructive-confirmation.candidate-run";
export { destructiveCandidates, everyCommand } from "./destructive-confirmation.candidates";
export { UNCONFIRMED_DESTRUCTIVE } from "./destructive-confirmation.debt";
export { runDestructiveConfirmationScan } from "./destructive-confirmation.run-scan";
export { CONFIRMS_BEFORE_ACTING, NOT_DESTRUCTIVE } from "./destructive-confirmation.sets";
export { carriesDestructiveVerb, DESTRUCTIVE_VERBS } from "./destructive-confirmation.verbs";
