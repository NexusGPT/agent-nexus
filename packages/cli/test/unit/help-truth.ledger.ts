/**
 * THE HELP-TRUTH LEDGER — every command whose `--help` fails a rule TODAY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT A LINE MEANS, AND WHAT IT DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A line is a MEASUREMENT of a defect that is already shipped, never permission
 * for it. `help-truth.test.ts` compares this file against the live scan and
 * fails in FOUR directions, which is what makes it a ratchet rather than a
 * suppression list:
 *
 *   1. a violation on a command NOT listed here          -> RED (a new defect)
 *   2. a listed command that now has NO violations       -> RED (prune the line)
 *   3. a listed command whose violation SET has moved    -> RED, both ways: a key
 *      that appeared is a new defect, a key that vanished is a fix that must be
 *      written down. Without the second arm the ledger stops ratcheting — an
 *      entry recording three defects silently re-permits the two that were fixed.
 *   4. a listed command no longer in the tree            -> RED (renamed or gone)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * HOW ADDING TO IT IS MADE LOUD — and why that is not the same as impossible
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * No test can stop a person editing this file, and claiming otherwise would be
 * the false green this gate exists to prevent. Two mechanisms make an addition
 * VISIBLE, and each costs a second deliberate edit in the same diff:
 *
 *   - {@link LEDGER_CEILING} is the VIOLATION count as measured — not the entry
 *     count, because one entry carries several keys. One more violation fails
 *     the gate until this number is ALSO raised — a number going the wrong way,
 *     in the diff, where a reviewer reads it.
 *   - {@link CLEAN_NAMESPACES} is WRITTEN OUT, never derived. Derived it would
 *     be true by construction and would gate nothing. Re-opening a namespace
 *     named there costs a third edit that no per-command arm can see.
 *
 * ⚠️ DELETING A LINE IS NEVER HOW A RED BUILD IS FIXED. A red says the command
 * moved: fix the help, or — if the command was renamed — rename the key.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * READING A KEY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   R0-no-example      the leaf shows no `$ nexus …` invocation, so rules 1-4 are
 *                      BLIND to it. This is the tripwire, not a style note.
 *   R0-no-notes        the leaf ships no `Notes:` block.
 *   R1 <code> <flag>   commander refuses the example: the reader cannot run it.
 *   R2 body.<field>    a key inside `--body '{…}'` the route's schema refuses.
 *   R3 --flag=<value>  an id-shaped flag value the route's schema refuses.
 *   R4 arg<n>=<value>  a literal id in a path slot whose format the route sets.
 *   R6 arg<n>=<token>  a PLACEHOLDER (`<thing-id>`, `1111...`) in a path slot
 *                      whose format the route fixes. The shell eats the angle
 *                      brackets and the route refuses the literal, so it is no
 *                      more runnable than R4's slug — R4 simply skipped it.
 *
 * A key names the CAUSE — never a line number, never a message — so reflowing
 * prose cannot rot the ledger.
 */

/** Command path -> the violation keys it produces, sorted. */
export const HELP_TRUTH_LEDGER: Readonly<Record<string, readonly string[]>> = {};

/**
 * The number of VIOLATIONS the scan produces, as measured. A ceiling, never a
 * target.
 *
 * ⚠️ VIOLATIONS, NOT ENTRIES — `LEDGER 5` compares it against
 * `report.violations.length`, and one entry carries several keys, so the two
 * numbers are far apart and reading this as an entry count makes the ceiling
 * look wildly slack.
 *
 * The gate refuses a scan that produces more. Lowering it as defects are fixed
 * is the ratchet; raising it is the visible cost of writing a new defect down.
 */
export const LEDGER_CEILING = 0;

/**
 * The DENOMINATOR: how many namespaces the CLI registers, as measured.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A NUMERATOR ALONE IS NOT PROGRESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * {@link CLEAN_NAMESPACES} counts the namespaces that are done. On its own that
 * is a number with nothing to divide by, so "how far along is this?" had no
 * answer anywhere in the repository — and the only two counts that had been
 * written down lived in prose, in `because:` strings and docblocks, where
 * nothing checked them. Both had gone stale by one. That is the whole failure
 * this constant exists to prevent: a count nobody can check reads exactly like a
 * count somebody checked.
 *
 * `PROGRESS 1` asserts this equals the live commander tree, so the denominator
 * cannot rot in silence. Registering a namespace reddens it, and the fix is to
 * raise this number in the same diff — where a reviewer reads it.
 *
 * ⚠️ VISIBLE namespaces. `upgrade` registers 18 hidden aliases (`up`, `bump`,
 * `install`, …); `deriveCommandNamespaces()` drops them, so they are outside
 * this count. They are top-level command NAMES, never namespaces — 65 top-level
 * names are {@link NAMESPACE_TOTAL} namespaces.
 */
export const NAMESPACE_TOTAL = 49;

/**
 * Namespaces asserted to hold NO ledger entry at all — written out, never
 * derived, because a derived list is true by construction and gates nothing.
 *
 * These are the namespaces whose `--help` is true by every rule this gate can
 * check. `role` is the model the rest were written from, so a red here means the
 * FORM has drifted.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS LIST IS THE NUMERATOR, SO IT HAS TO BE COMPLETE IN BOTH DIRECTIONS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `LEDGER 6` guards one direction — a name here must stay clean. That alone
 * makes the list a floor and not a measurement: four namespaces
 * (`agent-tool`, `conversation`, `known-issues`, `upgrade`) had become clean and
 * nobody added them, so the recorded numerator said 6 where the tree said 10 and
 * no gate could tell the difference.
 *
 * `PROGRESS 2` guards the other direction: a namespace with zero violations MUST
 * be named here. Fixing the last defect in a namespace now reddens the build
 * until the name is added.
 *
 * `PROGRESS 3` guards the third side — every name here must still BE a
 * namespace. `LEDGER 6` cannot supply it: it asks whether a declared name holds
 * a ledger entry, and a namespace that does not exist holds none, so a ghost
 * name passes as clean and inflates the count with the build green.
 *
 * Together the three make `CLEAN_NAMESPACES.length / NAMESPACE_TOTAL` the
 * programme's actual progress. Drop `PROGRESS 2` and it reads low; drop
 * `PROGRESS 3` and it reads high.
 */
export const CLEAN_NAMESPACES: readonly string[] = [
  // ⚠️ `conversation`, `permissions` and `role` LEFT this list when R6 landed and
  // are BACK in it now, and the two events are not each other's undo. R6 made
  // their abstentions visible; this batch gave them real coverage. Measured, not
  // estimated: `conversation` went 1 operand judged / 28 skipped -> 29 / 0, and
  // `role` 3 / 57 -> 20 / 40. Nothing was measured LESS to restore a name.
  //
  // `role`'s residual 40 skips are the CORRECT kind and will not go to zero. Its
  // first argument is `.argument("<role>", "Role name or UUID")` — the CLI
  // resolves a name client-side before the route sees a UUID — so R4 and R6 both
  // exempt it by design. A namespace can be fully judged on the operands that
  // carry a format and still report skips; that is the exemption working, not a
  // gap. `analytics` is the opposite shape: it reports 0 / 0 and shows up as
  // CONTRACT-BLIND, because its only defect was an R3 FLAG value and it ships no
  // path operand for R4 to judge at all.
  //
  // The nine namespaces this batch closed were ONE defect wearing three rule ids.
  // R4 is a slug in a path slot, R6 a placeholder in a path slot, R3 a slug in a
  // flag value; all three are "a literal the route's own schema refuses", and the
  // id is spelled `11111111-1111-4111-8111-111111111111` everywhere now.
  //
  // ⚠️ R0 CLOSED SIX MORE, AND IT TURNED OUT TO BE TWO DIFFERENT DEFECTS WEARING
  // ONE KEY. On `claude-code list`, `skills version` and `docs search` the caveat
  // was ALREADY WRITTEN and simply sat outside a `Notes:` heading — a layout
  // defect, fixed by relocating the text verbatim. On `auth list`, `auth unpin`,
  // `skills list`, `skills where` and `agent-skill presets` there was no prose at
  // all, and what went in is a fact the CODE carries and the help did not: the
  // installer matches the unstripped slug and refuses the name the table prints;
  // a `.nexusrc` pin and two environment variables outrank the active profile;
  // `auth list` answers `[]` under --json and a human sentence without it.
  //
  // `admin` and `vibe` are the other two R0 namespaces and are deliberately NOT
  // here: 42 of their leaves carry no `addHelpText` at all, so they need facts
  // written from the route rather than prose moved, and that is a different pass.
  // ⚠️ `admin` CLOSED WITHOUT A LINE OF RELOCATED PROSE, WHICH IS THE OPPOSITE
  // OF THE SIX ABOVE. Nine of its fifteen leaves carried no `addHelpText` at
  // all, so every sentence there is read off the route the verb calls: the
  // transition it drives, whether `--duration-ms` is refused locally before any
  // request, and which inputs are customer-visible. The other six already held
  // real prose under a `Why this exists:` or `Output fields:` heading and were
  // relocated verbatim by renaming the heading — the probe test matches against
  // the WHOLE help text, so a rename preserves every substring.
  // ⚠️ THE CRITERION CHANGED FOR THE SEVEN BELOW, AND SAYING SO IS THE POINT.
  // Every earlier batch was picked as the largest single defect class. That
  // stopped mapping to progress: R4 alone is 70 of the 117 violations this batch
  // started from, and NO namespace is pure-id-class any more — every one left
  // also carries R0-no-notes or R2 — so fixing 76% of the ledger would have
  // closed nothing. The criterion is now namespaces-closed-per-unit-work.
  //
  // `access-card` and `ticket` are one violation each: an example the parser
  // genuinely refuses. `ticket create` spread a --data payload across three
  // lines, which no tokenizer reassembles, and `access-card create` named a
  // .json file that does not exist — and that one fails at PARSE time, because
  // the command declares other required flags so --data is resolved before the
  // action runs.
  // ⚠️ `access-card`, `agent-skill`, `agent-tool` and `version` LEFT this list
  // when the nested-resource blind spot closed, and are back now on their own
  // merit. Each had been certified on path ids no rule had ever put to a schema,
  // because `sdkCallsIn` matched two path segments and their SDK calls have
  // three — `client.agents.versions.list(…)`, `client.credentials.cards.get(…)`.
  // Once the detector could read them, 39 of their examples turned out to name
  // an id the route refuses. Those are fixed, so this list is 47/47 again and
  // the second 47/47 is the stronger claim: four namespaces are now MEASURED
  // rather than exempt by blindness.
  "access-card",
  "admin",
  "agent",
  "agent-collection",
  "agent-eval",
  "agent-skill",
  "agent-tool",
  "analytics",
  "api",
  "asset",
  "auth",
  "channel",
  "claude-code",
  "cloud-import",
  // `collection remove-document` types its documentId as a UUID while
  // `attach-documents` types the SAME id as a plain string, so a malformed id is
  // named at the edge on one route and reaches the database on the other. The
  // attach help now says so, because no schema will.
  "collection",
  "conversation",
  "credential",
  // `cue` is clean from its first commit rather than remediated into cleanliness
  // (NEX-2816): its three leaves each carry a `Notes:` block written off the
  // route, its one path operand is spelled as a real UUID, and its `--format`
  // enumerates its own values in the option description. Nothing was relocated
  // because nothing was misplaced.
  "cue",
  "custom-model",
  "customer",
  "deployment",
  "docs",
  "document",
  "emulator",
  "execution",
  "external-tool",
  "folder",
  "html-template",
  "known-issues",
  // `mcp` is the first namespace to arrive clean rather than be cleaned: it
  // shipped with `Examples:` and `Notes:` on every leaf, so it holds no ledger
  // entry and never has. Its id-shaped example values use the
  // `11111111-1111-4111-8111-111111111111` spelling this file settled on — the
  // variant nibble is 4/8 because zod's `.uuid()` refuses anything else.
  "mcp",
  // `model list` was the namespace's only entry and its only leaf. It gained a
  // Notes block explaining that the listing carries TWO kinds of row — a
  // platform model, selected by `modelId` + `provider`, and an organization's
  // own endpoint, selected by the row's `id` through `--custom-model-id` and by
  // neither of the strings it displays (NEX-3858). That closed `R0-no-notes`.
  "model",
  // `permissions access` spelled its resource id
  // `11111111-1111-1111-1111-111111111111`, which zod's `.uuid()` REFUSES: the
  // variant nibble must be one of 8/9/a/b and that string carries a 1. So the
  // literal this repository had been reaching for as "obviously a placeholder
  // UUID" is not a UUID, and the route said so.
  "permissions",
  "phone-number",
  "prompt-assistant",
  "role",
  "skill-folder",
  "skills",
  "task",
  "task-eval",
  "template",
  "ticket",
  "tool",
  "tracing",
  "upgrade",
  "user-group",
  "version",
  // Every leaf spelled its workflow id `wf-123`, and `Workflow.id` is a
  // `@db.Uuid`, so all 29 examples that named one were a 400 the reader could
  // not tell from a typo. `node test`, `node test-payload` and
  // `platform-listener-events` each carried real prose ABOVE their examples with
  // no `Notes:` heading — the content was there, in the one place a reader of
  // any other command does not look.
  //
  // ⚠️ `vibe` IS THE MIRROR OF `admin`, AND THE PAIR IS THE FINDING. `admin` had
  // NINE of fifteen leaves with no `addHelpText` at all, so its help had to be
  // written from the route. `vibe` had THREE of twenty-seven: twenty-four leaves
  // already carried the caveat a reader needs and R0 could not see it, because
  // the text sat under no heading. Those twenty-four are a `Notes:` line
  // inserted above prose that is otherwise byte-identical — 24 insertions, zero
  // deletions, every added line the literal `Notes:`.
  //
  // The three bare ones — `app list`, `deployments list`, `deployments get` —
  // were read one at a time rather than assumed, and all three turned out
  // legible: the untruncated Id column is deliberate because it is where the id
  // every other verb takes comes from, and `deployments get` prints TWO records
  // where the second is the build job.
  "vibe",
  "workflow",
  "workspace"
];
