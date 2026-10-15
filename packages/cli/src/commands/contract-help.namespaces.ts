/**
 * THE REGISTRARS for contract-generated help, and the taxonomy of what is NOT
 * generated.
 *
 * 🚨 THE LIST OF NAMESPACES IS NOT HERE. It is `contract-help.ledger.ts`, which
 * imports nothing, and that file's header owns the reason: a registrar is a
 * VALUE, so naming them makes this module import every command file it names,
 * each of which imports the `*.contract.generated.ts` the generator writes.
 * Reading the list therefore used to require the generator's own output to
 * already be on disk — which it is not, during the one check that proves the
 * output is current. Read that header before moving anything back.
 *
 * This module pairs each ledger entry with its registrar and re-exports the
 * combined list as `GENERATED_NAMESPACES`, so every consumer that wants to BUILD
 * a namespace is unchanged. The generator's phase 1 reads the ledger alone.
 *
 * ── Why the registrar is named here rather than discovered ──────────────────
 *
 * `command-universe.ts` derives the WHOLE tree by importing every module in this
 * directory and calling each arity-1 `register*` export, and that is the right
 * instrument for its own question — "is the sweep's list of 34 leaves still all
 * of them". It is the wrong one here, for a reason that is a property of the
 * mechanism rather than of today's tree: it imports all ~60 command modules, so
 * a gate built on it reports on the health of 57 modules it does not check. Any
 * one of them failing to import makes this file red with a message about
 * somebody else's file and no signal about the contract at all.
 *
 * That is not hypothetical — measured while writing this, with two neighbouring
 * modules mid-edit: `ReferenceError: DOCS_URL is not defined` from `docs.ts`,
 * and a `model.ts` typecheck error. Neither has anything to do with a contract
 * binding, and both took the entire suite from "10 assertions" to "no tests".
 *
 * So this list names its own registrars, exactly as `help-completeness.test.ts`
 * does for its six. The population it walks is the namespaces named below, not
 * the CLI, and naming them is the honest scope rather than a second census.
 *
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the DOCUMENT and the public surface; the bodies live in
 * `contract-help/`, one concern per file:
 *
 *   · `blocked-reasons.ts`         the vocabulary of refusals, and what each
 *                                  member does and does not mean;
 *   · `blocked-descriptors.ts`     the refusals this pass established, one
 *                                  record per descriptor;
 *   · `uncontracted-namespaces.ts` the namespaces with no contract to derive
 *                                  from — the shape no reason can express;
 *   · `namespace-registrars.ts`    the ledger-keyed registrar map, and the one
 *                                  file that imports every command module;
 *   · `generated-namespaces.ts`    the ledger with registrars attached, and
 *                                  `buildNamespace`.
 *
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. `NAMESPACE_REGISTRARS` became an export of
 * its own part so `generated-namespaces.ts` can read it, and is NOT re-exported
 * here: widening this module's public surface under cover of a refactor is a
 * behaviour change nothing in a green suite reports. A part that needs a
 * sibling's helper imports it directly.
 *
 * 🚨 IMPORTING THIS BARREL STILL LOADS EVERY COMMAND MODULE THE MAP NAMES, so
 * nothing about the generator's two phases changed. What the split moved is the
 * three DATA lists, off that graph — `blocked-reasons.ts`,
 * `blocked-descriptors.ts` and `uncontracted-namespaces.ts` now import nothing
 * but each other — which is what the ledger's own header asks for and is why
 * they are separate files rather than one.
 *
 * 🚨 THOSE THREE LISTS NOW HAVE TO COVER EVERY VISIBLE NAMESPACE, AND UNTIL
 * RECENTLY NOTHING CHECKED THAT. `BLOCKED_DESCRIPTORS` is total over the
 * descriptors a leaf CALLS AND THAT DECLARE AN ENUM — both qualifiers are
 * deliberate, and together they leave a namespace-shaped hole. `known-issues`
 * shipped through it: one leaf, one descriptor, no enum, and therefore no entry
 * in the audit's population and no entry in any list here.
 *
 * `contract-blocked-audit.ts` derives the namespace partition too, and reds on
 * one that is accounted for nowhere. Read the ratio off that census rather than
 * off any sentence — the denominator moved the last time somebody wrote it down.
 */

export { BLOCKED_DESCRIPTORS, type BlockedDescriptor } from "./contract-help/blocked-descriptors";
export type { BlockedReason } from "./contract-help/blocked-reasons";
export {
  buildNamespace,
  GENERATED_NAMESPACES,
  type GeneratedNamespace
} from "./contract-help/generated-namespaces";
export {
  UNCONTRACTED_NAMESPACES,
  type UncontractedNamespace
} from "./contract-help/uncontracted-namespaces";
