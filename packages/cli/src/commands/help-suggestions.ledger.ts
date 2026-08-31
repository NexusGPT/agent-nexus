/**
 * THE AUTHORED-SUGGESTION LEDGER for `--help` — DATA ONLY.
 *
 * One entry per suggestion in the `--help` truth audit: 237 things a
 * verification agent had to discover by running the command, which `--help`
 * could have stated. The schema-derivable share of that audit is emitted by
 * `contract-help.codegen.ts` and tracked in `contract-help.ledger.ts`. THIS
 * file tracks the other half — warnings, sequencing notes, result-shape hints
 * and gotchas. No schema holds any of them, so no generator can emit them and
 * every one is placed by a person.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY A LEDGER AND NOT A COUNT IN A TICKET COMMENT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The progress figure on this work was carried as prose — "10 placed" — and
 * nothing on the machine could check it. A placed suggestion is one line inside
 * one `addHelpText` block among 501 leaves; deleting it, rewording it away, or
 * regenerating over it leaves the figure reading exactly the same. So the
 * number and the tree could disagree indefinitely with no event that says so.
 *
 * An entry marked `placed` therefore carries a `probe`: a literal substring
 * that MUST appear in the real `--help` output of `leaf`.
 * `help-suggestions.ledger.test.ts` captures that help from the real root
 * program and fails by id when the probe is gone. The count is then a property
 * of the tree rather than a claim about it.
 *
 * ── THE THREE STATES, AND WHY `blocked` IS NOT `open` ────────────────────────
 *
 *   `open`     — not in the tree. See the paragraph below before reading that
 *                as "nobody has started it".
 *   `placed`   — the line is in the tree. Requires `leaf` AND `probe`.
 *   `blocked`  — placing it would require asserting something this repository
 *                cannot establish. Requires `reason`.
 *   `obsolete` — the tree no longer has the defect the suggestion describes.
 *                Requires `reason`.
 *
 * 🚨 `obsolete` IS NOT `placed`, AND FOLDING IT IN WOULD BE A LIE IN THE
 * NUMERATOR. The audit is a snapshot of a tree that has moved since, so a row
 * can be answered by a change nobody made for it — `workflow create`'s
 * "--body alone never runs" describes a CLI in which `applyBodySatisfiesRequired`
 * now clears `--name`'s mandatory bit and re-imposes the requirement in a
 * preAction hook that has read `--body`, so the form the audit says is impossible
 * is the one the example uses. There is no line to place and no probe to write,
 * and counting it as placed would attach a probe to a note that does not exist.
 *
 * It is not `open` either: nobody should go looking for work that is already
 * gone. The `reason` names what changed, so the next reader can disagree with
 * the judgement instead of re-deriving it.
 *
 * 🚨 `open` IS TWO DIFFERENT FACTS AND `REVIEWED_NAMESPACES` IS WHICH ONE.
 * Several suggestions were ALREADY satisfied by help text written before this
 * ledger existed — the first sweep found 5 of `ticket`'s 6 rows already in the
 * tree. So an `open` row means "examined, and genuinely not there" inside a
 * reviewed namespace, and "nobody has looked yet" outside one. Collapsing the
 * two is the same defect this file replaced: a figure nobody can check.
 *
 * A namespace joins `REVIEWED_NAMESPACES` when every one of its rows has been
 * read against the REAL `--help` of the leaf it names — never on the strength
 * of having placed some of them.
 *
 * 🚨 `blocked` exists because the audit's own evidence is sometimes a LIVE
 * OBSERVATION against one organization at one moment — "31 of 100 listed rows
 * have type=null", "50 attachments came back". Those may be true and they are
 * not properties of this tree. Writing one into `--help` as a flat statement
 * manufactures exactly the defect the audit catalogued: a confident `--help`
 * sentence with nothing behind it. Such an entry stays `blocked` with the act
 * that would settle it named, and it is counted separately from work nobody
 * has started.
 *
 * ── A PLACED ROW CAN BE ANSWERED AND WRONG AT ONCE: `defect` ────────────────
 *
 * A probe asks ONE question — is this string in the help — so a note that is
 * present and WRONG passes it. `channel-01` was that shape: `channel setup
 * --json` printed the step table as one JSON document and then, when every
 * prerequisite was met, a second `{ success: true, … }` document, and the
 * published `jq` one-liner read the second, indexed a boolean with `"label"`
 * and ABORTED — at precisely the moment its answer would be "ready", which is
 * the only moment anyone runs it for. The note was written; what it said was
 * false.
 *
 * `defect` is how such a row is COUNTABLE while it waits for its fix.
 *
 * 🚨 THAT IS NOT A FIFTH STATE, AND ADDING ONE WOULD BREAK EVERY COUNT IN THIS
 * FILE. The four states partition the audit by ONE question — is this
 * suggestion answered — and a note that is present but wrong IS answered: the
 * writing happened, the line is in the tree, and deleting it must still red on
 * the probe. A fifth state forces every count to decide whether it belongs in
 * the numerator, and BOTH answers are wrong. Inside, "N of 237 placed" claims
 * text that misleads. Outside, `open` regrows to hold work that is done, and
 * the next sweep goes to write a line that is already there.
 *
 * So the row stays `placed` and carries an OPTIONAL `defect`, legal only on
 * `placed`, holding one Linear identifier and nothing else.
 *
 * ── WHY `DEFECTIVE_COUNT` SITS BESIDE `PLACED_COUNT` AND IS NEVER SUBTRACTED ─
 *
 * "N placed, M known-defective" keeps ONE question per number and lets a
 * reader subtract. Netting the defect out of `PLACED_COUNT` would answer two
 * questions with one figure — is the note written, and is what is written
 * right — and it would hide that the note exists at all, so the next sweep
 * re-places a line already in the tree.
 *
 * ⚠️ THE FIELD IS A POINTER, NOT A FIX, AND IT CANNOT BECOME ONE. A probe's
 * whole semantics are "this string is present in the help", and no field on this
 * row changes that — a `defect` row's probe keeps passing over the broken recipe
 * for as long as the recipe ships. Only a spec beside the COMMAND bites: one
 * that reads the shipped recipe out of the real `--help` and evaluates it
 * against real `--json` output. `channel-setup-json-verdict.test.ts` is that
 * spec for `channel-01`, and it is the shape any future `defect` row is retired
 * by — a test of the CLI, never of this ledger.
 *
 * ⚠️ THIS FILE IMPORTS NOTHING. Same reason as `contract-help.ledger.ts`: a
 * ledger that imports a command file drags in that file's generated contract
 * module, and the drift check runs the generators against a tree it has just
 * wiped. `help-suggestions.ledger.test.ts` fails on any import statement here.
 *
 * ── ADDING A PLACEMENT ──────────────────────────────────────────────────────
 *
 *   1. Verify the claim against the CODE — the Zod contract, the flag
 *      declaration, the action body. Never against the audit's prose alone.
 *   2. Write the line into that leaf's `addHelpText("after", …)` block.
 *   3. Flip the entry to `placed`, set `leaf` to the exact command path and
 *      `probe` to a distinctive substring of the line you wrote.
 *
 * A probe that is a whole sentence rots on the first reword. Pick the shortest
 * fragment that could not appear by accident in another note.
 *
 * ── THE DENOMINATOR ─────────────────────────────────────────────────────────
 *
 * 237 is asserted in the spec, not written in prose here, and it is the audit's
 * own total. It does not move: this ledger is the audit, not a running list of
 * everything anyone ever wants `--help` to say. A NEW idea about `--help` is a
 * new ticket, never a 238th row — the moment the denominator drifts, "X of 237"
 * stops meaning what the audit measured.
 */

export type HelpSuggestionState = "open" | "placed" | "blocked" | "obsolete";

export interface HelpSuggestion {
  /** Stable, namespace-prefixed. Never renumbered — a red names this. */
  readonly id: string;
  /** The audit's own target, verbatim. Prose for the cross-cutting rows. */
  readonly target: string;
  /** The audit's suggestion, clipped. The attachment on the ticket is full. */
  readonly summary: string;
  readonly state: HelpSuggestionState;
  /** Exact command path, e.g. "ticket get". Required when `placed`. */
  readonly leaf?: string;
  /** Literal substring that must appear in `leaf`'s help. Required when `placed`. */
  readonly probe?: string;
  /** Required when `blocked` or `obsolete`. What must be established, or what changed. */
  readonly reason?: string;
  /**
   * A Linear identifier for a KNOWN DEFECT in the note this row placed. `placed`
   * only — every other state is refused by id in the spec, because a defect in a
   * note nobody wrote is not a fact about this tree.
   *
   * `NEX-<digits>`, whole string, asserted in the spec. Free text here would
   * become a second `reason` with no owner and no reader: a sentence explaining
   * why the note is wrong tells nobody to go fix it. If the defect is real and
   * has no ticket, FILE THE TICKET — that act is what makes it someone's, and it
   * is cheaper than the field it would otherwise turn into.
   */
  readonly defect?: string;
}

/**
 * The numerator, recorded so it can be WRONG.
 *
 * 🚨 A FLOOR IS NOT A COUNT. This started as `placed.length >= 1`, which is
 * satisfied by a ledger where every placement but one has been reverted — the
 * exact drift this file exists to catch, passing the case written to catch it.
 * The spec asserts EQUALITY, refused in both directions, the way the lint-debt
 * and spec-double ledgers in this repository already work.
 *
 * So landing a placement is two edits in one reviewed diff: the row, and this
 * number. That is the friction, and it is the feature — a figure nobody has to
 * update is a figure nobody can trust.
 */
export const PLACED_COUNT = 211;

/**
 * The DENOMINATOR of "N of 237" — the audit's own total, as a CEILING.
 *
 * 🚨 AN UPPER BOUND, NEVER AN EQUALITY, AND THE DIRECTION IT REFUSES IS THE ONE
 * THIS NUMBER IS FOR. A 238th row is what makes "N of 237" stop meaning what the
 * audit measured, and a new idea about `--help` is a new ticket rather than a
 * row here. That is GROWTH, and a ceiling refuses it by name.
 *
 * An equality also refused a SHRINK, and a shrink is somebody deliberately
 * removing a row — a correct edit that a gate must not red. The numerator stays
 * honest without it: `PLACED_COUNT` is an equality in both directions, and the
 * state partition in the spec is asserted against this table's OWN length rather
 * than against a literal, so a deleted `placed` row still reds by name.
 */
export const AUDIT_TOTAL = 237;

/**
 * The KNOWN-DEFECTIVE subset of that numerator, recorded so it can be WRONG.
 *
 * Reported beside `PLACED_COUNT`, never subtracted from it — see the header.
 *
 * 🚨 EXACT, REFUSED IN BOTH DIRECTIONS, AND THE DIRECTION THAT MATTERS IS
 * REMOVAL. Deleting a `defect` line makes the row read clean again with no other
 * change anywhere in this file and no probe going red — which is the precise
 * failure the field exists to prevent. A floor would be satisfied by a ledger
 * somebody had just quietly cleaned.
 *
 * ⚠️ NO `>= 1` FLOOR HERE, DELIBERATELY, AND THAT IS THE OPPOSITE CALL FROM
 * `PLACED_COUNT`. Zero placements is a ledger that measures nothing; zero known
 * defects is the CORRECT END STATE — every defective note fixed. So this
 * dropping to 0 must be legal. The shape cases in the spec then iterate an empty
 * set and prove nothing, which is why the identifier grammar is pinned against
 * LITERALS rather than against these rows.
 */
export const DEFECTIVE_COUNT = 0;

export const HELP_SUGGESTIONS: readonly HelpSuggestion[] = [
  {
    id: "global-01",
    target: "nexus --help",
    summary:
      "Warn that the global options --api-key, --base-url, --profile and --timeout SHADOW subcommand options of the same name.",
    state: "obsolete",
    reason:
      "the audit reports that the global --api-key, --base-url, --profile and --timeout shadow subcommand options spelled the same. The collision is gone and a gate holds it gone: `util/global-option-shadowing.ts` derives every colliding subcommand flag from the real command tree, and `global-option-shadowing.test.ts` reds on any collision that is not declared. The audit's own cause \u2014 `custom-model create`'s --base-url and --api-key \u2014 was cured by renaming them to --endpoint-url and --endpoint-key, so the warning would describe a hazard no command still has."
  },
  {
    id: "global-02",
    target: "every subcommand --help",
    summary: "State that --json is a GLOBAL flag.",
    state: "placed",
    leaf: "auth whoami",
    probe: "GLOBAL FLAGS, USABLE HERE"
  },
  {
    id: "global-03",
    target: "create-family commands",
    summary: "Say which flag carries the JSON body: --body vs --data vs --file, per command.",
    state: "placed",
    leaf: "nexus",
    probe: "FIVE COMMANDS SPELL THE BODY FLAG --data"
  },
  {
    id: "cross-cutting-01",
    target: "customer · user-group · skill-folder · role · permissions",
    summary: "top-level: '--json prints ONE JSON document on STDOUT'",
    state: "placed",
    leaf: "nexus",
    probe: "prints ONE JSON document on STDOUT"
  },
  {
    id: "access-card-01",
    target: "access-card create",
    summary: "--color <color> Card color (slate, blue, green, etc.)",
    state: "placed",
    leaf: "access-card create",
    probe: '--color IS A FREE STRING AND "(slate, blue, green, etc.)" IS NOT A SET'
  },
  {
    id: "access-card-02",
    target: "access-card update",
    summary: "(whether a metadata-only update touches policies: unstated)",
    state: "placed",
    leaf: "access-card update",
    probe: "THE REPLACEMENT ONLY FIRES WHEN YOU ACTUALLY SEND policies"
  },
  {
    id: "access-card-03",
    target: "access-card list / credential",
    summary: "Say the master card is created AUTOMATICALLY with the credential.",
    state: "placed",
    leaf: "access-card list",
    probe: "THE MASTER CARD IS CREATED WITH THE CREDENTIAL, BY THE PLATFORM"
  },
  {
    id: "access-card-04",
    target: "access-card available-actions",
    summary:
      "Note that the action set depends on the credential's source, and may be infrastructural rather than the tool's own API actions.",
    state: "placed",
    leaf: "access-card available-actions",
    probe: "THE ACTIONS DEPEND ON THE CREDENTIAL'S SOURCE"
  },
  {
    id: "access-card-05",
    target: "access-card create/update",
    summary:
      "Show that the policies map goes inside --data, alongside name/color, not as a bare argument.",
    state: "obsolete",
    reason:
      'both halves are already in the tree. "access-card create" documents policies as a map inside --data and both of its examples show it there beside the separate --name flag; "access-card update" states THE REPLACEMENT ONLY FIRES WHEN YOU ACTUALLY SEND policies, and that a metadata-only edit with no --data leaves policies untouched — which is the audit\'s own verified answer ("alone is fine"). There is no line left to write.'
  },
  {
    id: "access-card-06",
    target: "access-card delete",
    summary: "Say the operation is not idempotent.",
    state: "placed",
    leaf: "access-card delete",
    probe: "IT IS NOT IDEMPOTENT: DELETING AN ALREADY-DELETED CARD"
  },
  {
    id: "admin-01",
    target: "admin",
    summary: "reconcile the two subcommand lists in the same help page",
    state: "placed",
    leaf: "admin",
    probe: "this list and the Commands block above are the same set"
  },
  {
    id: "admin-02",
    target: "admin",
    summary: "give a zero-risk way to verify the admin token",
    state: "placed",
    leaf: "admin",
    probe: "CHECK THE TOKEN BEFORE YOU DRIVE ANYTHING WITH IT"
  },
  {
    id: "admin-03",
    target: "admin",
    summary: "state that the exit-code contract is admin-only",
    state: "obsolete",
    reason:
      "the row asks the admin namespace to declare its exit-code table admin-only, and that claim stopped being true. The whole CLI reads one taxonomy now (`src/exit-codes.ts`), and 2/3/4/5/6 mean in every namespace exactly what they meant here first. The help text says the opposite of what this row wanted — that the table MAY be carried to another page — which is the correct instruction and not an omission. What the row was really protecting is that a reader does not generalise a local contract; that is now served by there being no local contract to generalise."
  },
  {
    id: "agent-01",
    target: "agent create / agent update",
    summary: "state the actual --json response shape.",
    state: "placed",
    leaf: "agent create",
    probe: "THIS DOES NOT ECHO THE AGENT"
  },
  {
    id: "agent-02",
    target: "agent get",
    summary: "say that .prompt is the DRAFT, not the production version.",
    state: "placed",
    leaf: "agent get",
    probe: ".prompt IS THE DRAFT, NOT WHAT THE AGENT RUNS"
  },
  {
    id: "agent-03",
    target: "agent get / version get",
    summary: "document the prompt envelope.",
    state: "placed",
    leaf: "agent get",
    probe: ".prompt IS NOT BARE MARKDOWN"
  },
  {
    id: "agent-04",
    target: "agent create",
    summary: "give a working model-discovery command and name the code-interpreter family.",
    state: "blocked",
    reason:
      'the audit reports that the discovery command this help points at, "nexus model list", answers {} under --json and crashes without it. That is a DEFECT in model.list, not a missing line here, and it cannot be settled from this tree: it needs one authenticated run against a real organization. Establish it there, file it, then point agent create at a discovery command that works.'
  },
  {
    id: "agent-05",
    target: "agent create / agent update",
    summary: "cross-reference the skills prerequisite.",
    state: "placed",
    leaf: "agent create",
    probe: "DECIDES WHETHER SKILLS ARE AVAILABLE AT ALL"
  },
  {
    id: "agent-06",
    target: "agent duplicate",
    summary: "list what does NOT survive the copy.",
    state: "placed",
    leaf: "agent duplicate",
    probe: "THREE THINGS DO NOT SURVIVE"
  },
  {
    id: "agent-07",
    target: "agent list",
    summary: "describe the columns the table actually prints.",
    state: "placed",
    leaf: "agent list",
    probe: "THE TABLE IS ID / FIRST NAME / LAST NAME / ROLE / STATUS"
  },
  {
    id: "agent-08",
    target: "(cross-cutting: agent delete, agent-tool delete, folder delete, version delete)",
    summary: "fix the delete-response text once, in all four places.",
    state: "placed",
    leaf: "agent delete",
    probe: "{id, deleted: true}"
  },
  {
    id: "agent-collection-01",
    target: "agent-collection attach / detach / list",
    summary: "give this namespace notes at all.",
    state: "placed",
    leaf: "agent-collection",
    probe: "TWO WAYS TO GIVE AN AGENT A COLLECTION"
  },
  {
    id: "agent-eval-01",
    target: "agent-eval",
    summary: "put the feature-flag NAME in the server error, or say how to check it",
    state: "placed",
    leaf: "agent-eval",
    probe: "ASK WITH THE ONE READ THAT CHANGES NOTHING"
  },
  {
    id: "agent-eval-02",
    target: "agent-eval run create",
    summary: "ship a complete run.json the reader can copy",
    state: "placed",
    leaf: "agent-eval run create",
    probe: "A COMPLETE run.json, INLINE"
  },
  {
    id: "agent-skill-01",
    target: "agent-skill create",
    summary: "say that SKILL.md frontmatter is not read for the description.",
    state: "placed",
    leaf: "agent-skill create",
    probe: "SKILL.md FRONTMATTER IS NOT READ"
  },
  {
    id: "agent-skill-02",
    target: "agent-skill create / add-preset",
    summary: "name a code-interpreter model in the error path and the help text.",
    state: "placed",
    leaf: "agent-skill",
    probe: '"code-interpreter-*" ONES'
  },
  {
    id: "agent-skill-03",
    target: "agent-skill list / get",
    summary: "document the response fields, including the size totals.",
    state: "obsolete",
    reason:
      'the fields and both totals are documented on "agent-skill list", with a distinction the audit did not draw: totalCount and totalSizeBytes describe EVERYTHING attached to the agent, not the page. "agent-skill get" documents its own field set and says it is metadata only. The row asked for the response fields including the size totals; all of it is present.'
  },
  {
    id: "agent-skill-04",
    target: "agent-skill update / delete / list / get",
    summary: "add the missing per-command notes.",
    state: "obsolete",
    reason:
      'all four commands the audit found without Notes — update, delete, list, get — now have them, and two of the audit\'s own facts are refuted by the tree. "update" carries the lowercase/hyphen rule and the identical-message rejection; "get" carries metadata-only, no file list. But the audit says "delete needs no --yes off a TTY", and delete is wrapped in confirmable(): its Notes say --yes IS REQUIRED IN A SCRIPT. The audit also reports delete answering {success,id}; the route answers {success,message} and the id a caller sees under --json is printSuccess\'s own line. Placing this row as drafted would ship two false sentences.'
  },
  {
    id: "agent-tool-01",
    target: "agent-tool create",
    summary: "give the ordered recipe for a WORKFLOW tool.",
    state: "placed",
    leaf: "agent-tool create",
    probe: "THE WHOLE ORDER, FOR A WORKFLOW TOOL"
  },
  {
    id: "agent-tool-02",
    target: "agent-tool create / attach-collection / agent-collection attach",
    summary: "cross-reference the three ways to give an agent a collection.",
    state: "placed",
    leaf: "agent-collection",
    probe: '(or "agent-tool create --type COLLECTION")'
  },
  {
    id: "agent-tool-03",
    target: "agent-tool update",
    summary: "give the read-modify-write one-liner for the wholesale --config replace.",
    state: "placed",
    leaf: "agent-tool update",
    probe: "cfg=$(nexus agent-tool get"
  },
  {
    id: "agent-tool-04",
    target: "agent-tool create",
    summary: "name the config shape for TASK and DOCUMENT_TEMPLATE types.",
    state: "placed",
    leaf: "agent-tool create",
    probe: "TASK AND DOCUMENT_TEMPLATE HAVE NO KEY OF THEIR OWN"
  },
  {
    id: "analytics-01",
    target: "analytics --help",
    summary: "a namespace note saying when to use metrics vs query vs overview.",
    state: "placed",
    leaf: "analytics",
    probe: "THREE READ SURFACES OVER ONE DATASET"
  },
  {
    id: "analytics-02",
    target: "analytics metrics",
    summary: "how to discover a view's column names, and that --show-sql writes to STDERR.",
    state: "placed",
    leaf: "analytics metrics",
    probe: "NOTHING HERE LISTS A VIEW'S COLUMNS"
  },
  {
    id: "analytics-03",
    target: "analytics metrics / analytics query",
    summary:
      "a cross-reference stating the two commands share the same 8 views under different names.",
    state: "placed",
    leaf: "analytics query",
    probe: "THESE ARE THE SAME EIGHT VIEWS"
  },
  {
    id: "analytics-04",
    target: "analytics overview",
    summary: "the top-level field list, flagging which fields are objects.",
    state: "placed",
    leaf: "analytics overview",
    probe: "EIGHT SCALARS AND FIVE NESTED FIELDS"
  },
  {
    id: "analytics-05",
    target: "analytics feedback",
    summary: "the score scale for --score, and the meta shape.",
    state: "placed",
    leaf: "analytics feedback",
    probe: "--score IS A 0-TO-1 SCALE, NOT 1-5"
  },
  {
    id: "analytics-06",
    target: "analytics export",
    summary: "the CSV's section structure.",
    state: "placed",
    leaf: "analytics export",
    probe: "IT IS NOT ONE ROW PER CONVERSATION"
  },
  {
    id: "api-01",
    target: "api",
    summary: "state the actual --json output shape and give a working jq line",
    state: "placed",
    leaf: "api",
    probe: 'THE OUTPUT IS ALWAYS AN OBJECT WITH A "data" KEY'
  },
  {
    id: "api-02",
    target: "api",
    summary: "document the pagination meta shape alongside the --query example",
    state: "placed",
    leaf: "api",
    probe: '"meta" IS WHAT DRIVES A PAGING LOOP'
  },
  {
    id: "api-03",
    target: "api",
    summary: "state that a non-2xx exits non-zero, so scripts can branch on `$?`",
    state: "placed",
    leaf: "nexus",
    probe: "EVERY failure exits NON-ZERO"
  },
  {
    id: "api-04",
    target: "api",
    summary: "cross-reference `nexus api GET /workspaces/<slug>/files --query path=<dir>`",
    state: "placed",
    leaf: "api",
    probe: "SOME ROUTES HAVE NO TYPED COMMAND AT ALL"
  },
  {
    id: "asset-01",
    target: "asset (namespace)",
    summary: "give this namespace a Notes section — it is the only one of the five with none.",
    state: "obsolete",
    reason:
      "the row asks for a Notes section on the `asset` namespace because it was the only one of the five without one. It has one, and it carries more than the row asked for: that the URL is public, unsigned and permanent and is therefore the opposite of `document download`'s signed hour-long link; that deleting an asset usually breaks every page using it and that the delete is two operations whose second may fail; and that the file's BYTES are checked against its extension, so renaming something to .png does not get it in. The audit also wanted the extension allowlist enumerated, which is still discoverable only from a 400 — that is a smaller gap than the row, and the row's own ask is answered."
  },
  {
    id: "asset-02",
    target: "asset upload / asset get",
    summary: "note that the asset id is not the id in the public URL.",
    state: "placed",
    leaf: "asset upload",
    probe: "THE ID IS NOT THE ID IN THE URL"
  },
  {
    id: "asset-03",
    target: "asset (namespace)",
    summary: "say what assets are FOR — cross-reference the consumers.",
    state: "placed",
    leaf: "asset",
    probe: "not knowledge: nothing here is indexed"
  },
  {
    id: "auth-01",
    target: "auth list",
    summary: "document the --json shape (a bare ARRAY, with a `marker` field)",
    state: "placed",
    leaf: "auth list",
    probe: "--json IS A BARE ARRAY AND THE ACTIVE PROFILE IS FLAGGED BY A GLYPH"
  },
  {
    id: "auth-02",
    target: "auth whoami",
    summary: "name the unknown-profile case, or reuse `auth status`'s error text",
    state: "placed",
    leaf: "auth whoami",
    probe: "A PROFILE NAME THAT DOES NOT EXIST REPORTS AS"
  },
  {
    id: "auth-03",
    target: "auth switch",
    summary: "warn that NEXUS_PROFILE and .nexusrc SHADOW the switch",
    state: "obsolete",
    reason:
      "the audit reports that `auth switch` succeeds silently while an ephemeral flag keeps the old profile in force. It is no longer silent: the command re-resolves configuration with the ephemeral flags removed and calls `warnSwitchIneffective`, which names the exact shadowing source and sets exitCode 1, so an && chain halts instead of running the next command against the profile the user thought they had left."
  },
  {
    id: "auth-04",
    target: "auth pin",
    summary: "show the .nexusrc file contents and say it is committed-by-default risk",
    state: "placed",
    leaf: "auth pin",
    probe: "IT WRITES ./.nexusrc IN THE CURRENT DIRECTORY"
  },
  {
    id: "channel-01",
    target: "channel setup",
    summary: "(parsing the output)",
    state: "placed",
    leaf: "channel setup",
    // The note this probe pins moved on from "--json carries the verdict" to
    // "the exit code carries it". The suggestion was about how a caller learns
    // the channel is ready; the answer is now `$?` rather than a jq filter over
    // the document, and the jq one-liner this row's own history is about — the
    // `defect` worked example in the header above — is deleted rather than
    // corrected. The probe follows the sentence that answers the suggestion.
    probe: "THE EXIT CODE CARRIES THAT VERDICT"
  },
  {
    id: "channel-02",
    target: "channel setup / whatsapp-template list / approvals",
    summary: "(empty is not an error)",
    state: "placed",
    leaf: "channel",
    probe: "AN EMPTY LIST HERE USUALLY MEANS STEP 1 NEVER HAPPENED"
  },
  {
    id: "channel-03",
    target: "channel whatsapp-template test-send",
    summary: "(safer alternative)",
    state: "placed",
    leaf: "channel whatsapp-template test-send",
    probe: "THERE IS NO WAY TO PREVIEW THE RENDERED TEMPLATE"
  },
  {
    id: "claude-code-01",
    target: "nexus claude-code install",
    summary: "Examples: '$ nexus claude-code install nexus-workflow-builder # Install one skill'",
    state: "placed",
    leaf: "claude-code install",
    probe: "NAMING ONE SKILL NARROWS THE SKILLS AND NOTHING ELSE"
  },
  {
    id: "cloud-import-01",
    target: "cloud-import (all commands)",
    summary: "use a UUID in every --connection-id example, and say where to find the real one.",
    state: "placed",
    leaf: "cloud-import",
    probe: "THAT ID IS A UUID, AND IT IS CHECKED BEFORE ANYTHING ELSE IN YOUR CALL"
  },
  {
    id: "cloud-import-02",
    target: "cloud-import browse / search / import",
    summary: "warn that a connection problem is reported as a Nexus API-key failure.",
    state: "placed",
    leaf: "cloud-import",
    probe: "A CONNECTION THAT DOES NOT RESOLVE IS REPORTED AS AN API-KEY FAILURE"
  },
  {
    id: "cloud-import-03",
    target: "cloud-import providers",
    summary: "surface supportsRefreshToken in the table, or explain it.",
    state: "placed",
    leaf: "cloud-import providers",
    probe: "THE TABLE HIDES THE FIELD THAT DECIDES WHETHER A CONNECTION SURVIVES"
  },
  {
    id: "cloud-import-04",
    target: "cloud-import browse vs google-drive list-files",
    summary: "reconcile the --folder-id default between the twin commands.",
    state: "placed",
    leaf: "cloud-import",
    probe: "THEY DO NOT TAKE THE SAME FLAGS"
  },
  {
    id: "cloud-import-05",
    target: "cloud-import search / import (sharepoint)",
    summary: "quote the real siteId error text, and note the validation ORDER.",
    state: "placed",
    leaf: "cloud-import import",
    probe: "refused as SITE_ID_REQUIRED without"
  },
  {
    id: "collection-01",
    target: "collection create",
    summary:
      "state that --name is a required FLAG even when --body carries a name, and fix the body-only example.",
    state: "obsolete",
    reason:
      'the audit reports that --name must be typed beside a --body that already carries it, and that the two body-only examples cannot run. `applyBodySatisfiesRequired` (`util/body-satisfies-required.ts`) deleted both: `collection create` matches its DERIVED population — a `--body <json>` flag plus at least one other mandatory option — so --name\'s mandatory bit is cleared and the requirement is re-imposed in a preAction hook that has already resolved --body, BACKFILLING name into the option store. Verified by parse rather than by reading the action: `collection create --body \'{"name":"faq","displayName":"FAQ"}\'` reaches the request. Both shipped examples carry a name key and both run — which is also why `help-truth.ledger.ts` records no R1 entry for this command, since R1 feeds every example to the real commander. There is no line to place.'
  },
  {
    id: "collection-02",
    target: "collection create",
    summary: "document the k bounds.",
    state: "placed",
    leaf: "collection create",
    probe: "k IS BOUNDED BELOW ONLY"
  },
  {
    id: "collection-03",
    target: "collection create",
    summary: "say that the create response does not echo the settings.",
    state: "placed",
    leaf: "collection create",
    probe: "THE CREATE RESPONSE ECHOES NOTHING YOU SET"
  },
  {
    id: "collection-04",
    target: "collection attach-documents",
    summary: "print the response shape, since the Notes describe a count that is not in it.",
    state: "placed",
    leaf: "collection attach-documents",
    probe: "THE RESPONSE COUNTS NOTHING"
  },
  {
    id: "collection-05",
    target: "collection query",
    summary: "document the result object fields, and what --include-metadata actually does.",
    state: "placed",
    leaf: "collection query",
    probe: "THERE IS NO DOCUMENT NAME"
  },
  {
    id: "collection-06",
    target: "collection search",
    summary: "warn that crawled pages cannot be found by name search.",
    state: "placed",
    leaf: "collection search",
    probe: "NAMED AFTER THE LAST SEGMENT OF ITS URL"
  },
  {
    id: "collection-07",
    target: "collection list / collection documents",
    summary: "state the --json envelope per command; it is not uniform inside this one namespace.",
    state: "placed",
    leaf: "collection list",
    probe: "--json IS A BARE ARRAY"
  },
  {
    id: "conversation-01",
    target: "conversation list / messages / search",
    summary: "(meta shape differs per command)",
    state: "placed",
    leaf: "conversation",
    probe: "NO TWO OF THEM CARRY THE SAME meta"
  },
  {
    id: "conversation-02",
    target: "conversation assign",
    summary: "(where user ids come from)",
    state: "placed",
    leaf: "conversation assign",
    probe: "WHERE THE IDS COME FROM, BECAUSE NOTHING IN THIS NAMESPACE LISTS THEM"
  },
  {
    id: "conversation-03",
    target: "conversation assigned-users",
    summary: "(undocumented useful field)",
    state: "placed",
    leaf: "conversation assigned-users",
    probe: "IT ALSO ANSWERS responseHandling"
  },
  {
    id: "conversation-04",
    target: "conversation comments",
    summary: "(author fields)",
    state: "placed",
    leaf: "conversation comments",
    probe: "THE AUTHOR COLUMN IS BLANK ON EVERY COMMENT"
  },
  {
    id: "conversation-05",
    target: "conversation messages",
    summary: "(how to reach a conversation from a deployment)",
    state: "placed",
    leaf: "conversation messages",
    probe: "REACHING THIS COMMAND FROM A DEPLOYMENT YOU JUST TESTED"
  },
  {
    id: "credential-01",
    target: "credential list",
    summary: "Say what --search matches.",
    state: "placed",
    leaf: "credential list",
    probe: "--search MATCHES MORE THAN THE NAME, AND NOT THE SERVICE"
  },
  {
    id: "credential-02",
    target: "credential get",
    summary:
      "Repeat (or cross-reference) the meaning of `source` here, as `credential list --help` does.",
    state: "obsolete",
    reason:
      "`credential get` explains `source` in full and goes past what the row asked. The row wanted the meaning repeated or cross-referenced from `credential list`; the text names the three backing records (oauth_connection, api_key_connection, tool_credential) and both consequences that make the field matter — what `credential delete` has to tear down, and which of name/description `credential update` can actually store. A reader arriving via `get` misses nothing."
  },
  {
    id: "credential-03",
    target: "credential update",
    summary:
      "Show that this command takes --data, not --body, and that --name/--description are flags rather than body keys.",
    state: "placed",
    leaf: "nexus",
    probe: "FIVE COMMANDS SPELL THE BODY FLAG --data"
  },
  {
    id: "custom-model-01",
    target: "custom-model create/update",
    summary: "--protocol <protocol> Inference protocol (default: openai)",
    state: "placed",
    leaf: "custom-model create",
    probe: "Inference protocol (default: openai)"
  },
  {
    id: "custom-model-02",
    target: "custom-model list",
    summary: "List custom models",
    state: "placed",
    leaf: "custom-model list",
    probe: "THIS COMMAND SEES A DISABLED MODEL"
  },
  {
    id: "custom-model-03",
    target: "custom-model create",
    summary: "Give the REST body field names, which differ from the flag names.",
    state: "placed",
    leaf: "custom-model create",
    probe: "fill the body's baseUrl and apiKey"
  },
  {
    id: "custom-model-04",
    target: "custom-model get",
    summary: "Say the apiKey is write-only and never returned.",
    state: "placed",
    leaf: "custom-model get",
    probe: "THE apiKey IS WRITE-ONLY AND NEVER COMES BACK"
  },
  {
    id: "custom-model-05",
    target: "custom-model create",
    summary: "Say whether the endpoint is validated or contacted at create time.",
    state: "placed",
    leaf: "custom-model create",
    probe: "A 201 MEANS STORED, NEVER"
  },
  {
    id: "custom-model-06",
    target: "custom-model list",
    summary: "Point at where a custom model becomes selectable once created.",
    state: "placed",
    leaf: "custom-model list",
    probe: "THE ID COLUMN IS WHAT MAKES A MODEL SELECTABLE"
  },
  {
    id: "customer-01",
    target: "customer create",
    summary:
      "Options list is --display-name/--external-user-id/--email/--phone/--body; no statement about what --email does beyond 'Primary email'",
    state: "placed",
    leaf: "customer create",
    probe: "EACH CREATE A CHANNEL IDENTITY"
  },
  {
    id: "customer-02",
    target: "customer update",
    summary: "Options: --display-name, --email, --phone, --body <json>",
    state: "placed",
    leaf: "customer update",
    probe: "REPLACED WHOLE, NEVER MERGED"
  },
  {
    id: "customer-03",
    target: "customer note",
    summary: "'Add a note to a customer' (--content <text-or-->)",
    state: "placed",
    leaf: "customer note",
    probe: "A NOTE IS WRITE-ONLY THROUGH THIS API"
  },
  {
    id: "customer-04",
    target: "customer list / get / create / update",
    summary: "no response shapes documented",
    state: "placed",
    leaf: "customer",
    probe: "FOUR ENVELOPES IN ONE NAMESPACE"
  },
  {
    id: "customer-05",
    target: "customer delete",
    summary: "Delete a customer",
    state: "placed",
    leaf: "customer delete",
    probe: "THE CONVERSATIONS SURVIVE; THE CRM ROW AND ITS IDENTITIES DO NOT"
  },
  {
    id: "deployment-01",
    target: "deployment create",
    summary: "(EMBED --body top-level shape)",
    state: "placed",
    leaf: "deployment create",
    probe: 'THOSE FOUR OBJECTS NEST UNDER A TOP-LEVEL "settings" KEY'
  },
  {
    id: "deployment-02",
    target: "deployment create",
    summary: "(EMBED required leaf fields and their enums)",
    state: "placed",
    leaf: "deployment create",
    probe: "THE ENUM-VALUED LEAVES INSIDE settings ARE PRINTABLE"
  },
  {
    id: "deployment-03",
    target: "deployment create",
    summary: "(SMS vs the --type list)",
    state: "placed",
    leaf: "deployment create",
    probe: 'A bare "SMS" is now refused before the request'
  },
  {
    id: "deployment-04",
    target: "deployment update",
    summary: "(50-key cap scope)",
    state: "placed",
    leaf: "deployment update",
    probe: "CAP APPLIES HERE TOO, AND IT MEASURES YOUR PATCH"
  },
  {
    id: "deployment-05",
    target: "deployment delete",
    summary: "(--dry-run output format)",
    state: "placed",
    leaf: "deployment delete",
    probe: "--dry-run IGNORES --json AND PRINTS PROSE"
  },
  {
    id: "deployment-06",
    target:
      "deployment folder list / channel connection list / whatsapp-template list / phone-number…",
    summary: "(envelope shape)",
    state: "placed",
    leaf: "deployment folder list",
    probe: "not {data,meta} and not a bare array."
  },
  {
    id: "deployment-07",
    target: "deployment folder create",
    summary: "(flag/body interaction)",
    state: "obsolete",
    reason:
      'the audit reports that --name must be typed a second time beside a --body that already carries it. `applyBodySatisfiesRequired` (`util/body-satisfies-required.ts`) deleted that workaround: it clears --name\'s mandatory bit and re-imposes the requirement in a preAction hook that has already read --body, so `deployment folder create --body \'{"name":"Staging"}\'` reaches the API call. A body carrying no name and no --name flag is refused by a message naming both paths. There is no line to place.'
  },
  {
    id: "deployment-08",
    target: "deployment stats",
    summary: "(response shape)",
    state: "placed",
    leaf: "deployment stats",
    probe: "THE RESPONSE CARRIES A THIRD KEY THE TWO COUNTERS ARE"
  },
  {
    id: "deployment-09",
    target: "deployment get",
    summary: "(null fields on non-connected types)",
    state: "placed",
    leaf: "deployment get",
    probe: 'null ON EITHER FIELD IS "THIS CHANNEL BINDS NONE"'
  },
  {
    id: "docs-01",
    target: "nexus docs --full",
    summary: "Fetch and print the full documentation (from llms-full.txt)",
    state: "placed",
    leaf: "docs",
    probe: "Redirect it rather than reading it in a pager"
  },
  {
    id: "document-01",
    target: "document get",
    summary: "say plainly that processingProgress is a FOLDER field.",
    state: "placed",
    leaf: "document get",
    probe: "ON A LEAF DOCUMENT, POLL status"
  },
  {
    id: "document-02",
    target: "document create-text",
    summary: "note how fast small text indexes, so nobody builds a poll loop for it.",
    state: "blocked",
    reason:
      "the claim is a TIMING one -- a small text document reaching READY in about a second, so no poll loop is needed. Nothing in this tree fixes indexing latency, and a help line promising it would be a performance guarantee this repository cannot keep. Settle it with a measured run against a real organization, across sizes, before writing any number down."
  },
  {
    id: "document-03",
    target: "document create-text",
    summary: "keep the file-path form of --content but show it in the Examples.",
    state: "placed",
    leaf: "document create-text",
    probe: "A path is DETECTED, never declared"
  },
  {
    id: "document-04",
    target: "document upload",
    summary: "document the accepted file types and what happens to mimeType.",
    state: "placed",
    leaf: "document upload",
    probe: "mimeType IS RESOLVED FROM THE FILENAME"
  },
  {
    id: "document-05",
    target: "document update",
    summary: "show the read-modify-write recipe, not just the warning.",
    state: "placed",
    leaf: "document update",
    probe: "REPLACES THE WHOLE METADATA BAG"
  },
  {
    id: "document-06",
    target: "document reprocess",
    summary: "replace 'does nothing' with the actual error.",
    state: "placed",
    leaf: "document reprocess",
    probe: "A FOLDER ID IS REFUSED WITH A 400, NOT IGNORED"
  },
  {
    id: "document-07",
    target: "document add-website",
    summary: "state what a default crawl actually costs, and whether it stays on the domain.",
    state: "blocked",
    reason:
      "the claim is that a default crawl left the origin domain and stopped at 100 children rather than the documented 500. Both halves are observations of one crawl of one site; the crawler is server-side and its depth, cap and domain policy are not readable from this tree. Read them from the crawler service, or measure a crawl, before help states either."
  },
  {
    id: "document-08",
    target: "document add-website / document children",
    summary: "say how to identify a crawled page.",
    state: "placed",
    leaf: "document children",
    probe: "THE NAME COLUMN IS BLANK FOR A CRAWLED HOME PAGE"
  },
  {
    id: "document-09",
    target: "document delete",
    summary: "cross-reference --timeout where a long delete actually happens.",
    state: "placed",
    leaf: "document delete",
    probe: "OUTLASTS THE 30s CLIENT TIMEOUT"
  },
  {
    id: "document-10",
    target: "document children",
    summary: "state the pagination default.",
    state: "placed",
    leaf: "document children",
    probe: "THE FIRST PAGE IS 20 ROWS"
  },
  {
    id: "emulator-01",
    target: "emulator session list / get",
    summary: "(chatId is the conversation id)",
    state: "placed",
    leaf: "emulator session",
    probe: "chatId IS THE CONVERSATION ID"
  },
  {
    id: "emulator-02",
    target: "emulator send",
    summary: "(read the reply)",
    state: "placed",
    leaf: "emulator send",
    probe: "THE REPLY IS NEVER IN THIS RESPONSE, ON ANY STATUS"
  },
  {
    id: "emulator-03",
    target: "emulator send",
    summary: "(debug.tokensUsed)",
    state: "placed",
    leaf: "emulator send",
    probe: "DO NOT BILL FROM debug.tokensUsed"
  },
  {
    id: "emulator-04",
    target: "emulator scenario save",
    summary: "(messageCount semantics)",
    state: "placed",
    leaf: "emulator scenario save",
    probe: "messageCount COUNTS PARTICIPANT MESSAGES, NOT TURNS"
  },
  {
    id: "emulator-05",
    target: "emulator session delete",
    summary: "(what deleting every session leaves behind)",
    state: "obsolete",
    reason:
      'the tree answers this in full on the "emulator session" namespace help and CORRECTS the audit while doing it. It states that deleting every session leaves the conversations behind, ARCHIVED, and names the exact command that still lists them ("conversation list --deployment-id <dep> --status ARCHIVED"). The audit also claimed the inbox AND "deployment stats" keep counting them; the same block says "nexus deployment stats" EXCLUDES emulator sessions from both of its counters, so writing the row as drafted would ship a false sentence. Nothing is left to place.'
  },
  {
    id: "execution-01",
    target: "execution list",
    summary:
      "name the JSON field `executionType` alongside the table's TYPE column, and list its three values (run / loop_iteration / node_test).",
    state: "placed",
    leaf: "execution list",
    probe: 'THE TYPE COLUMN IS "executionType" IN --json'
  },
  {
    id: "execution-02",
    target: "execution get",
    summary:
      "mark which --json fields are populated only for production-triggered runs — triggerType, triggerData and pollingToken were all null for runs started…",
    state: "obsolete",
    reason:
      "the audit reports that triggerType, triggerData and error come back null on every execution. They were read off property names no source supplies \u2014 `workflow-execution.mapper.ts` records that, and now reads `entity.executionTrigger`, `entity.input` and a repository-resolved `executionError`. Only pollingToken still discriminates a running execution, and that half is already placed at `execution get`."
  },
  {
    id: "execution-03",
    target: "execution diagnose",
    summary:
      "promote outputSummary as the fastest way to read what each node emitted, and note that a branching node reports {chosenBranch, chosenBranchId} there.",
    state: "placed",
    leaf: "execution diagnose",
    probe: "outputSummary IS A TRUNCATED STRING, NOT THE OUTPUT"
  },
  {
    id: "execution-04",
    target: "execution node-result",
    summary:
      "say which fields are commonly null on a completed node (logs, duration, startedAt, completedAt) so their absence is not read as a failed lookup.",
    state: "placed",
    leaf: "execution node-result",
    // Three of the four named above are no longer null: `duration`, `startedAt`
    // and `completedAt` were read off property names `WorkflowExecutionNode` does
    // not declare, and now come from `createdAt`/`finishedAt` (NEX-3857).
    //
    // The fourth, `logs`, had no column to read, so it left the v1 contract
    // entirely (NEX-3864) rather than staying published and permanently null.
    //
    // The row stays PLACED rather than going obsolete, and the reason is the
    // whole point of the original audit item: a reader who was told to expect a
    // `logs` field and finds no key at all is in exactly the position this
    // suggestion exists to prevent — unable to tell "the field is gone" from "my
    // lookup failed". So the help now names the ABSENCE, and the probe follows
    // it. Removing a field does not remove the need to say where its data went.
    probe: "THERE IS NO logs FIELD"
  },
  {
    id: "execution-05",
    target: "execution retry",
    summary:
      "add that ids are UUID-validated before the stub responds, so a malformed id 400s while a well-formed but nonexistent one answers RETRYING.",
    state: "obsolete",
    reason:
      'both halves describe a tree that is gone. There is no stub: the adapter\'s body was `return {executionId, nodeId, status: "RETRYING"}` when the audit ran and it now delegates to `WorkflowService.retryWorkflowNode`, so a well-formed but nonexistent id answers 404 rather than RETRYING. And a malformed node id no longer 400s — `resolveNodeExecutionId` tests the uuid shape before the row-PK arm instead of letting Postgres raise P2023 (NEX-3857), so it 404s like every other miss. The 404/400 split that IS true is already placed at `execution retry`.'
  },
  {
    id: "external-tool-01",
    target: "external-tool get",
    summary:
      '...so this command cannot tell you what to pass to "external-tool test --operation-id" or "execute --action". Read them from your spec.',
    state: "placed",
    leaf: "external-tool get",
    probe: "NEITHER ARE THE OPERATION IDS"
  },
  {
    id: "external-tool-02",
    target: "external-tool list vs tool search",
    summary: "(--json envelope unstated on both)",
    state: "placed",
    leaf: "external-tool list",
    probe: "--json ANSWERS THE ROUTE'S OWN OBJECT: {items, total}"
  },
  {
    id: "external-tool-03",
    target: "external-tool create",
    summary: "Show one minimal COMPLETE body inline, not just prose requirements.",
    state: "placed",
    leaf: "external-tool create",
    probe: "A COMPLETE MINIMAL BODY IS FOUR KEYS"
  },
  {
    id: "external-tool-04",
    target: "external-tool create",
    summary:
      "State the response shape — {success, id, name} — and that id is what every other subcommand takes.",
    state: "placed",
    leaf: "external-tool create",
    probe: "IT DOES NOT ECHO THE TOOL"
  },
  {
    id: "external-tool-05",
    target: "external-tool create",
    summary:
      "Mention that status comes back PUBLISHED immediately — there is no separate publish step.",
    state: "placed",
    leaf: "external-tool create",
    probe: "THERE IS NO DRAFT AND NO PUBLISH STEP"
  },
  {
    id: "external-tool-06",
    target: "external-tool test / execute",
    summary:
      "Add a 'which one do I use' note — the two commands overlap but differ in flag name and response shape.",
    state: "placed",
    leaf: "external-tool test",
    probe: "TEST vs EXECUTE:"
  },
  {
    id: "external-tool-07",
    target: "external-tool test",
    summary:
      "Make the bogus-operation error list the available operations, as `execute` already does.",
    state: "placed",
    leaf: "external-tool test",
    probe: "A BOGUS OPERATION ID DOES NOT LIST THE REAL ONES HERE"
  },
  {
    id: "external-tool-08",
    target: "external-tool delete",
    summary: "Say there is no confirmation prompt and no --yes flag.",
    state: "placed",
    leaf: "external-tool delete",
    probe: "THERE IS NO CONFIRMATION PROMPT AND NO --yes FLAG"
  },
  {
    id: "external-tool-09",
    target: "external-tool update-spec",
    summary: "Say the response does not report what changed — re-read actionsCount via `get`.",
    state: "placed",
    leaf: "external-tool update-spec",
    probe: "THE RESPONSE DOES NOT SAY WHAT CHANGED"
  },
  {
    id: "external-tool-10",
    target: "external-tool update-auth",
    summary: "Document the body shape per auth.type, and warn that an incomplete one still saves.",
    state: "placed",
    leaf: "external-tool update-auth",
    probe: "SUCCEEDS WITH NO KEY MATERIAL"
  },
  {
    id: "folder-01",
    target: "folder create",
    summary: "point at the update command for the root/parent token.",
    state: "placed",
    leaf: "folder create",
    probe: '"OPTIONAL" MEANS OMIT parentId, NOT SEND null'
  },
  {
    id: "folder-02",
    target: "folder assign",
    summary: "describe the response by its real keys.",
    state: "placed",
    leaf: "folder assign",
    probe: "THE PRESENCE OF folderId IS THE SIGNAL"
  },
  {
    id: "folder-03",
    target: "folder list / folder assign",
    summary: "put the assignments recipe next to the commands that need it.",
    state: "placed",
    leaf: "folder assign",
    probe: "jq '.data.assignments'"
  },
  {
    id: "html-template-01",
    target: "html-template create",
    summary: "(a working end-to-end example)",
    state: "placed",
    leaf: "html-template",
    probe: "THE WHOLE LOOP:"
  },
  {
    id: "html-template-02",
    target: "html-template list",
    summary: "(paging)",
    state: "placed",
    leaf: "html-template list",
    probe: "THERE IS NO PAGING HERE AND NOTHING REPORTS A TOTAL"
  },
  {
    id: "html-template-03",
    target: "html-template (namespace)",
    summary: "(where these are used)",
    state: "placed",
    leaf: "html-template",
    probe: "THIS IS THE RICH-CARD MECHANISM FOR THE WEB WIDGET"
  },
  {
    id: "model-01",
    target: "model list",
    summary: "the field set a model row returns, and that there are no filter flags.",
    state: "placed",
    leaf: "model list",
    probe: "THE TABLE SHOWS FOUR COLUMNS AND A ROW CARRIES TWELVE FIELDS"
  },
  {
    id: "model-02",
    target: "model --help",
    summary: "a cross-reference to the commands that consume a model id.",
    state: "placed",
    leaf: "model",
    probe: "THIS NAMESPACE ONLY READS"
  },
  {
    id: "permissions-01",
    target: "permissions access",
    summary: "List every grant written against one resource",
    state: "placed",
    leaf: "permissions access",
    probe: "TWO GRANTS NOBODY WROTE"
  },
  {
    id: "permissions-02",
    target: "permissions revoke / user-group delete",
    summary: "revoke: no response fields documented",
    state: "placed",
    leaf: "permissions revoke",
    probe: "ASSERT ON revokedCount, NOT ON success"
  },
  {
    id: "permissions-03",
    target: "permissions (namespace help)",
    summary: "Share resources: read access lists, grant and revoke, read org visibility",
    state: "placed",
    leaf: "permissions",
    probe: "GRANTS ARE INDEXED BY RESOURCE, AND ONLY BY RESOURCE"
  },
  {
    id: "phone-number-01",
    target: "phone-number list / get",
    summary: "(empty org)",
    state: "placed",
    leaf: "phone-number get",
    probe: "an empty list with total 0"
  },
  {
    id: "phone-number-02",
    target: "phone-number search",
    summary: "(price is a string)",
    state: "placed",
    leaf: "phone-number search",
    probe: "IT IS A STRING, AND A JSON ROUND TRIP THROUGH A NUMBER CORRUPTS IT"
  },
  {
    id: "prompt-assistant-01",
    target: "prompt-assistant get-thread",
    summary: "the thread and promptResult field shapes.",
    state: "placed",
    leaf: "prompt-assistant get-thread",
    probe: "THE SHAPE, read from the top level without --wait"
  },
  {
    id: "prompt-assistant-02",
    target: "prompt-assistant get-thread",
    summary: "that promptResult.prompt is Nexus SECTION MARKUP, not plain prose markdown.",
    state: "placed",
    leaf: "prompt-assistant get-thread",
    probe: "NEXUS SECTION MARKUP, NOT PROSE MARKDOWN"
  },
  {
    id: "prompt-assistant-03",
    target: "prompt-assistant list-threads",
    summary: "that 'summary' is a truncated echo of the user's own first message.",
    state: "placed",
    leaf: "prompt-assistant list-threads",
    probe: "SUMMARY IS NOT ASSISTANT-WRITTEN, AND IT CHANGES MEANING WITH status"
  },
  {
    id: "prompt-assistant-04",
    target: "prompt-assistant chat",
    summary:
      "the exact client-side timeout the CLI applies, so an abort is distinguishable from a slow server.",
    state: "placed",
    leaf: "prompt-assistant chat",
    probe: "THREE DIFFERENT WAITS CAN END THIS COMMAND"
  },
  {
    id: "prompt-assistant-05",
    target: "prompt-assistant delete-thread",
    summary: "that there is no bulk delete and no delete-by-status.",
    state: "placed",
    leaf: "prompt-assistant delete-thread",
    probe: "THERE IS NO BULK DELETE AND NO DELETE-BY-STATUS"
  },
  {
    id: "role-01",
    target: "role automation-settings",
    summary:
      "Read the organization's working-time assumptions and currency / 'Every coverage figure rests on these three numbers'",
    state: "placed",
    leaf: "role automation-settings",
    probe: "ABSENCE IS A SUCCESS"
  },
  {
    id: "role-02",
    target:
      "role create / role add-member / user-group add-member / permissions grant --subject-type…",
    summary:
      "--owner <userId> · <user-id> Clerk user id of somebody in your organization · --subject-id user id",
    state: "placed",
    leaf: "role create",
    probe: "AND FROM NOWHERE ELSE IN THIS CLI"
  },
  {
    id: "role-03",
    target: "role attach / role detach vs permissions grant",
    summary:
      "role: --type (agent, ai_task, deployment, document_template, external_tool, workflow) · permissions: --resource-type (access_card, agent, credential,…",
    state: "placed",
    leaf: "role attach",
    probe: "Exactly three spellings are common to both"
  },
  {
    id: "role-04",
    target: "role delete",
    summary: "Options: -h only",
    state: "placed",
    leaf: "role delete",
    probe: "THIS DOES NOT PROMPT AND HAS NO --yes"
  },
  {
    id: "role-05",
    target: "role set-scope-lines",
    summary: "--body <json> { lines: [...] } as JSON, .json file, or '-' for stdin",
    state: "placed",
    leaf: "role set-scope-lines",
    probe: "THOSE THREE KEYS AND NO OTHERS"
  },
  {
    id: "role-06",
    target: "role (namespace help)",
    summary: "52 subcommands listed alphabetically in one block",
    state: "placed",
    leaf: "role",
    probe: "THAT LIST IS ALPHABETICAL, WHICH IS NOT AN ORDER ANYONE READS IT IN"
  },
  {
    id: "role-07",
    target: "role coverage",
    summary:
      "THREE ROWS PRODUCE THIS FIGURE ... plus each system's LIFECYCLE, which moves it without being a model ... The workload and the per-system impact are authored in the dashboard",
    state: "placed",
    leaf: "role coverage",
    probe: "THREE ROWS PRODUCE THIS FIGURE"
  },
  {
    id: "skill-folder-01",
    target: "skill-folder assign",
    summary: "--skill-id <id> Skill ID (workflow or task)",
    state: "obsolete",
    reason:
      "`skill-folder assign` already names both source commands and the trap between them. The row wanted `--skill-id` to say where an id comes from; the notes say a skill is a workflow or an AI task, that `nexus workflow list --json` is an object ({data,meta}) while `nexus task list --json` is a bare array, that one jq path cannot read both (.data[].id against .[].id), and that piping one into the other produces an empty id list rather than an error. It also states that a well-formed uuid naming neither answers 404, indistinguishably from another organization's."
  },
  {
    id: "skill-folder-02",
    target: "skill-folder list",
    summary: "List skill folders and assignments",
    state: "obsolete",
    reason:
      "the audit reports that the CLI drops the `assignments` array from the response, so the only way to see it is `nexus api`. `skill-folder.ts` returns the untouched response under --json and prints both tables without it, and the comment there names the exact defect the audit hit. The suggestion describes a shape the command no longer has."
  },
  {
    id: "skills-01",
    target: "nexus skills where",
    summary:
      "'Auto-detect walks up from the current directory and picks the first of: an existing .claude/ folder, a CLAUDE.md, then the git repo root.'",
    state: "placed",
    leaf: "skills where",
    probe: "SO A DISTANT .claude/ OUTRANKS A NEARBY CLAUDE.md"
  },
  {
    id: "skills-02",
    target: "nexus skills update",
    summary: "'✓ Installed 19 skills (3 files)'",
    state: "obsolete",
    reason:
      "the audit reports that an install silently overwrites local edits and reports only a file count. `util/skills-install.ts` keeps a checksum ledger of what it wrote, and `claude-code.ts` prints every preserved path by name, so a locally edited file is skipped and said out loud. The symptom the suggestion is written against cannot occur."
  },
  {
    id: "skills-03",
    target: "nexus skills update vs nexus claude-code install",
    summary:
      "skills: 'Install/refresh the bundled Claude Code skills + CLAUDE.md into your project' · claude-code: 'Install the Claude Code skills bundled with th…",
    state: "placed",
    leaf: "skills update",
    probe: 'THIS COMMAND AND "nexus claude-code install" RUN THE SAME INSTALLER'
  },
  {
    id: "task-01",
    target: "task create",
    summary:
      "give the working body shape — `--name <n> --model-name <m> --model-provider <p> --body <file.json>`; all three flags are required regardless of what…",
    state: "obsolete",
    reason:
      'the audit reports that --name, --model-name and --model-provider must be typed beside a --body that already carries them, so every --body example fails on three successive missing-option errors. `applyBodySatisfiesRequired` (`util/body-satisfies-required.ts`) deleted that: `task create` matches its DERIVED population — a `--body <json>` flag plus at least one other mandatory option — so all three mandatory bits are cleared and the requirement is re-imposed in a preAction hook that has already resolved --body, BACKFILLING name, modelName and modelProvider into the option store. Verified by PARSE against the real root program rather than by reading the action: the shipped third example, `task create --body \'{"name":"Extract","modelName":"gpt-4o","modelProvider":"OPEN_AI",…}\'`, reaches the HTTP call and fails only on the unreachable base URL. The root epilogue already states the general rule ("A REQUIRED FLAG IS SATISFIED BY --body TOO"), so there is no line to place.'
  },
  {
    id: "task-02",
    target: "task create",
    summary: "note that --prompt also accepts LITERAL text, not just a file path or '-'.",
    state: "placed",
    leaf: "task create",
    probe: "--prompt TAKES LITERAL TEXT, DESPITE ITS <file-or--> LABEL"
  },
  {
    id: "task-03",
    target: "task create",
    summary:
      "point at `task get` for verification — create answers {success,id,name} and echoes back none of the prompt, formats or schemas it just stored.",
    state: "placed",
    leaf: "task create",
    probe: "THE CREATE RESPONSE ECHOES NOTHING BACK BUT id AND name"
  },
  {
    id: "task-04",
    target: "task list",
    summary:
      "document the --json envelope this command answers, and that there is no --page (only --limit).",
    state: "placed",
    leaf: "task list",
    probe: "--json ANSWERS THE ROUTE'S OWN OBJECT: {items, total}"
  },
  {
    id: "task-05",
    target: "task update",
    summary:
      "replace the versionId note with the observed rule — every accepted update creates a version, including one whose body is byte-identical to the stored…",
    state: "placed",
    leaf: "task update",
    probe: "INCLUDING ONE THAT CHANGES NOTHING"
  },
  {
    id: "task-06",
    target: "task execute",
    summary:
      "state that --input is REQUIRED and is the only input channel — --body cannot carry the input on its own — and that a JSON-input task accepts either a…",
    state: "obsolete",
    reason:
      "both halves are answered and neither by anyone acting on this row. The first half is FALSE now: `task execute` matches `applyBodySatisfiesRequired`'s derived population (`--body <json>` beside the mandatory `--input`), so --input's mandatory bit is cleared and the requirement is re-imposed after --body has been read, with `input` backfilled. Verified by PARSE against the real root program: the shipped example `task execute <id> --body '{\"input\":\"Hello world\"}'` reaches the HTTP call, so --body IS a second input channel. The second half is already IN the tree — `task execute`'s notes carry \"A TASK WHOSE inputFormat IS 'JSON' ALSO TAKES A PLAIN STRING\" with the --body object form beside it. Writing this row would restate one fact and contradict the other."
  },
  {
    id: "task-07",
    target: "task delete",
    summary:
      "note that only NON-archived workflows count as dependents — archiving the workflow releases the task.",
    state: "placed",
    leaf: "task delete",
    probe: "ARCHIVING THE WORKFLOW RELEASES THE TASK"
  },
  {
    id: "task-eval-01",
    target: "task-eval (namespace)",
    summary:
      "add a Notes block with the ordered pipeline and the session state machine: session create -> dataset add -> execute -> judge -> results, over DRAFT -…",
    state: "placed",
    leaf: "task-eval",
    probe: "THE ORDER IS FIXED AND A SESSION WALKS IT ONCE"
  },
  {
    id: "task-eval-02",
    target: "task-eval judge",
    summary:
      "say the body is OPTIONAL (a bodiless judge applies a default judge and still scores), and cross-reference `task-eval judges` for the valid judgeModel…",
    state: "placed",
    leaf: "task-eval judge",
    probe: "A BODILESS JUDGE STILL SCORES"
  },
  {
    id: "task-eval-03",
    target: "task-eval results",
    summary:
      "document the row shape — status (execution) vs judgeStatus (PENDING until judged), score, judgeComment, executionError, judgeError.",
    state: "placed",
    leaf: "task-eval results",
    probe: "HIDES THE ONE THAT EXPLAINS A BLANK SCORE"
  },
  {
    id: "task-eval-04",
    target: "task-eval session get / list",
    summary:
      "document the summary fields (status, datasetRowCount, completedRows, failedRows, judgedRows, averageScore) and warn that `session list` does not popu…",
    state: "placed",
    leaf: "task-eval session get",
    probe: "ABSENT from a list row rather than null"
  },
  {
    id: "task-eval-05",
    target: "task-eval formats",
    summary:
      "say what these formats are FOR — the CLI exposes no dataset import command, so csv/json/jsonl are only usable outside `nexus task-eval dataset`.",
    state: "placed",
    leaf: "task-eval dataset add",
    probe: "lists are not accepted by any"
  },
  {
    id: "task-eval-06",
    target: "task-eval dataset add",
    summary:
      "document the accepted row fields (input, expectedOutput, metadata) and that input is mandatory.",
    state: "placed",
    leaf: "task-eval dataset add",
    probe: "ONLY input IS REQUIRED"
  },
  {
    id: "template-01",
    target: "template upload / template get",
    summary: "document the placeholder syntax the parser recognises.",
    state: "obsolete",
    reason:
      'the premise is dead, and the tree kills it deliberately. The audit asks for the placeholder syntax "the parser recognises" because a .docx uploaded cleanly and left inputFormat null. "template upload" now states that the route STORES THE FILE AND READS NOTHING OUT OF IT — it never runs the placeholder parser — and "template get" states that inputFormat READS null FOR EVERY TEMPLATE THIS API CAN BUILD, because the parser is behind a dashboard-only route. The null is unconditional, never a verdict on the file. Documenting a syntax this API never applies would resurrect exactly the inference those two blocks exist to kill.'
  },
  {
    id: "template-02",
    target: "template get",
    summary: "say what promotes a template from DRAFT to SAVED.",
    state: "placed",
    leaf: "template get",
    probe: "nothing in this API ever writes SAVED"
  },
  {
    id: "template-03",
    target: "template create / template list",
    summary: "note that template names are not unique.",
    state: "placed",
    leaf: "template list",
    probe: "NAMES ARE NOT UNIQUE. Two templates with the same name"
  },
  {
    id: "template-04",
    target: "template generate",
    summary: "say that generated files are unlistable as well as undeletable.",
    state: "obsolete",
    reason:
      'already placed, and more fully than the row asks. "template generate" states that no row is written for a generated file, that "nexus document list" never shows it, that there is no "template generations" verb, that the returned url is THE ONLY REFERENCE THAT WILL EVER EXIST, and that every run leaves another file no command here deletes. Unlistable and undeletable are both in the tree, alongside the signed-url expiry the audit did not have.'
  },
  {
    id: "template-05",
    target: "template (namespace)",
    summary: "say up front that create is irreversible.",
    state: "obsolete",
    reason:
      'the premise died with NEX-3713, which is the ticket this row helped file. Creation is no longer irreversible: "nexus template delete <id>" exists and DELETE /public/v1/skills/document-templates/:templateId is behind it. The old note ("A TEMPLATE CANNOT BE DELETED ... a mistake is clutter nobody can clear") was the strongest argument in the tree FOR building the delete, and it argued itself out of existence. The namespace help now states what delete does and does not take — the row goes, the documents it generated stay — plus the 409 that refuses while an AI task, agent task or agent skill still points at it; that is template-04\'s subject, already covered at "template generate", not this row\'s.'
  },
  {
    id: "ticket-01",
    target: "ticket list / update / close",
    summary: "tell the reader to READ the live status set instead of printing a fixed one.",
    state: "placed",
    leaf: "ticket list",
    probe: "READ THE STATUS SET, NEVER ASSUME IT"
  },
  {
    id: "ticket-02",
    target: "ticket list",
    summary: "that 'type' comes back null on a large share of tickets.",
    state: "placed",
    leaf: "ticket list",
    probe: "TYPE IS OFTEN EMPTY"
  },
  {
    id: "ticket-03",
    target: "ticket list",
    summary: "that --search matches a description the command does not return.",
    state: "placed",
    leaf: "ticket list",
    probe: "the text that matched it is not"
  },
  {
    id: "ticket-04",
    target: "ticket attachments",
    summary: "the row shape, and that many attachments are LINKS rather than uploaded files.",
    state: "placed",
    leaf: "ticket attachments",
    probe: "Branch on url, never on contentType"
  },
  {
    id: "ticket-05",
    target: "ticket comments",
    summary: "the row shape, naming authorName.",
    state: "placed",
    leaf: "ticket comments",
    probe: '"authorName" IN --json'
  },
  {
    id: "ticket-06",
    target: "ticket create / update",
    summary: "a pointer to 'ticket get' as the read-back that proves what the server kept.",
    state: "placed",
    leaf: "ticket create",
    probe: "shows you what was actually stored"
  },
  {
    id: "tool-01",
    target: "tool search",
    summary: "--type <type> Filter by type",
    state: "placed",
    leaf: "tool search",
    // Anchored on the AUTHORED sentence about the flag, never on the enum's own
    // values. The previous probe was "TASK, INTERNAL_TOOL" — the first two
    // members of the value list — so NEX-4314 moving `--type` from `ToolType` to
    // `AgentExternalToolType` deleted the anchor along with the values, and this
    // row failed for a reason that had nothing to do with the note still being
    // placed. A probe that is a slice of a generated list re-breaks on every
    // legitimate change to that list.
    probe: "--type IS THE INTEGRATION KIND"
  },
  {
    id: "tool-02",
    target: "tool execute",
    summary:
      'Notes: For CUSTOM_MANIFEST external tools, use "nexus external-tool execute" instead.',
    state: "placed",
    leaf: "tool execute",
    probe: "THIS RUNS CUSTOM_MANIFEST TOOLS TOO"
  },
  {
    id: "tool-03",
    target: "nexus tool --help",
    summary:
      "Note that this namespace has no `list`, and that `tool search` with no --query browses the whole catalogue.",
    state: "placed",
    leaf: "tool search",
    probe: "--query IS OPTIONAL, AND OMITTING IT BROWSES"
  },
  {
    id: "tool-04",
    target: "nexus tool --help",
    summary:
      "Explain why `tool skills` lives here — it lists ORG skills (workflows/tasks/collections), not marketplace tools.",
    state: "placed",
    leaf: "tool skills",
    probe: "THIS LISTS YOUR ORGANIZATION"
  },
  {
    id: "tool-05",
    target: "tool search",
    summary: "List the --category values, or point at where they come from.",
    state: "placed",
    leaf: "tool search",
    probe: "--category IS FREE TEXT AND VALIDATES NOTHING"
  },
  {
    id: "tool-06",
    target: "tool get",
    summary:
      "Say that the response carries the full actions[] array — key, name, description and parameters[] with type/required/default.",
    state: "placed",
    leaf: "tool get",
    probe: "THIS IS THE AUTHORITATIVE ACTION LIST"
  },
  {
    id: "tool-07",
    target: "tool connect",
    summary:
      "Show the two different success shapes and name the handshakeId as connection-status's input.",
    state: "placed",
    leaf: "tool connect",
    probe: "THE TWO BRANCHES ANSWER TWO DIFFERENT SHAPES"
  },
  {
    id: "tool-08",
    target: "tool connect",
    summary:
      "Cross-reference: the credential id this returns is not the id the credential/access-card commands take — get that from `credential list`.",
    state: "placed",
    leaf: "tool connect",
    probe: "TOOL-SCOPED, NOT THE INVENTORY ID"
  },
  {
    id: "tool-09",
    target: "tool connection-status",
    summary: "List the status values the poller can see and say what a terminal state looks like.",
    state: "placed",
    leaf: "tool connection-status",
    probe: "FOUR STATES, AND ONLY ONE OF THEM MEANS KEEP POLLING"
  },
  {
    id: "tracing-01",
    target: "tracing export-bulk",
    summary: "one line saying the JSON output is a BARE ARRAY, with no data/meta envelope.",
    state: "placed",
    leaf: "tracing export-bulk",
    probe: "THE DOCUMENT IS A BARE ARRAY"
  },
  {
    id: "tracing-02",
    target: "tracing export",
    summary:
      "one line saying the single-trace JSON is a bare OBJECT with the generations nested inside it.",
    state: "placed",
    leaf: "tracing export",
    probe: "THE DOCUMENT IS A BARE OBJECT"
  },
  {
    id: "tracing-03",
    target: "tracing generations",
    summary: "the extra fields --json carries beyond the table columns.",
    state: "placed",
    leaf: "tracing generations",
    probe: "A --json ROW CARRIES 26 KEYS"
  },
  {
    id: "tracing-04",
    target: "tracing traces / tracing generations",
    summary: "the --limit ceiling for these two list commands.",
    state: "placed",
    leaf: "tracing traces",
    probe: "--limit IS 1-100 AND DEFAULTS TO 20"
  },
  {
    id: "tracing-05",
    target: "tracing cost-breakdown",
    summary: "that LABEL is unresolved for some group-by keys.",
    state: "placed",
    leaf: "tracing cost-breakdown",
    probe: "LEAVING A BARE UUID IN KEY"
  },
  {
    id: "tracing-06",
    target: "tracing --help",
    summary: "a pointer to the analytics views as the aggregate surface over the same data.",
    state: "placed",
    leaf: "tracing",
    probe: "AGGREGATES THE SAME DATA"
  },
  {
    id: "tracing-07",
    target: "tracing timeline",
    summary: "that the bucket key is a full ISO timestamp, truncated in the table.",
    state: "placed",
    leaf: "tracing timeline",
    probe: "THE BUCKET KEY IS NOT A DATE"
  },
  {
    id: "upgrade-01",
    target: "upgrade",
    summary: "document what the command actually does",
    state: "placed",
    leaf: "upgrade",
    probe: "IT RUNS A GLOBAL PACKAGE-MANAGER INSTALL AS YOU"
  },
  {
    id: "user-group-01",
    target: "user-group create / add-member",
    summary: "--user-ids <ids> Comma-separated Clerk user IDs to seed the membership",
    state: "placed",
    leaf: "user-group create",
    probe: "EVERY SEED ID MUST ALREADY BE A MEMBER"
  },
  {
    id: "user-group-02",
    target: "user-group list / create / update / add-member",
    summary: "no response shapes documented",
    state: "placed",
    leaf: "user-group",
    probe: "THREE ENVELOPES IN ONE NAMESPACE"
  },
  {
    id: "version-01",
    target: "version list",
    summary: "warn that one prompt write produces two rows.",
    state: "placed",
    leaf: "version list",
    probe: "ONE PROMPT WRITE PRODUCES TWO ROWS"
  },
  {
    id: "version-02",
    target: "version delete",
    summary: "give the safe rollback/cleanup order.",
    state: "placed",
    leaf: "version delete",
    probe: "TO DELETE THE PRODUCTION VERSION, PUBLISH ANOTHER ONE FIRST"
  },
  {
    id: "version-03",
    target: "version create",
    summary: "say what gets checkpointed when the agent has no prompt.",
    state: "placed",
    leaf: "version create",
    probe: "AN EMPTY DRAFT CHECKPOINTS AND PUBLISHES ANYWAY"
  },
  {
    id: "vibe-01",
    target: "vibe",
    summary: "put the end-to-end ORDER of operations on the namespace help",
    state: "placed",
    leaf: "vibe",
    probe: "THAT IS NOT THE ORDER TO RUN THEM"
  },
  {
    id: "vibe-02",
    target: "vibe app get",
    summary: "document the response fields — the help has no Notes section",
    state: "placed",
    leaf: "vibe app get",
    probe: "gitProjectId SCALAR"
  },
  {
    id: "vibe-03",
    target: "vibe app update",
    summary: "say how shipGateMode relates to --require-verification",
    state: "placed",
    leaf: "vibe app update",
    probe: "A TWO-STATE FLAG OVER A THREE-STATE FIELD"
  },
  {
    id: "vibe-04",
    target: "vibe app create",
    summary: "say the git-project-name warning goes to STDERR",
    state: "placed",
    leaf: "vibe app create",
    probe: "THAT WARNING GOES TO STDERR"
  },
  {
    id: "vibe-05",
    target: "vibe app delete",
    summary: "say env vars are destroyed with the app",
    state: "placed",
    leaf: "vibe app delete",
    probe: "THE APP'S ENVIRONMENT VARIABLES GO WITH IT"
  },
  {
    id: "vibe-06",
    target: "vibe env set",
    summary: "say which scope the running app actually reads",
    state: "placed",
    leaf: "vibe env set",
    probe: "ALL UNION PROD, WITH PROD WINNING ON A NAME"
  },
  {
    id: "vibe-07",
    target: "vibe env list",
    summary: "explain the Source / Card / Status columns",
    state: "placed",
    leaf: "vibe env list",
    probe: "THE Card COLUMN NAMES WHOSE AUTHORITY"
  },
  {
    id: "vibe-08",
    target: "vibe git-project get",
    summary: "label the 'Build source' URL — it is NOT where you push",
    state: "placed",
    leaf: "vibe git-project get",
    probe: "it is not your push remote"
  },
  {
    id: "vibe-09",
    target: "vibe git-credentials",
    summary: "document the two undocumented response fields",
    state: "placed",
    leaf: "vibe git-credentials",
    probe: 'THE "Org" ROW IS NOT YOUR NEXUS ORGANIZATION'
  },
  {
    id: "vibe-10",
    target: "vibe app register-as-tool",
    summary: "state the ordering prerequisite up front",
    state: "placed",
    leaf: "vibe app register-as-tool",
    probe: "DEPLOY FIRST."
  },
  {
    id: "vibe-11",
    target: "vibe app edge-token",
    summary: "cross-reference that a visibility flip invalidates the token",
    state: "placed",
    leaf: "vibe app edge-token",
    probe: "USUALLY A VISIBILITY FLIP, NOT AN"
  },
  {
    id: "vibe-12",
    target: "vibe deploy-state",
    summary: "add the NO_REPOSITORY-to-fixed worked path",
    state: "placed",
    leaf: "vibe deploy-state",
    probe: "EACH OUTCOME NAMES A DIFFERENT FIX"
  },
  {
    id: "vibe-13",
    target: "vibe audit list",
    summary: "name the events worth alerting on",
    state: "placed",
    leaf: "vibe audit list",
    probe: "IS THE ONLY RECORD THAT A SHIP GATE WAS"
  },
  {
    id: "workflow-01",
    target: "workflow create",
    summary:
      "give the working invocation shape — `--name` is a commander option, so the body form is `--name <n> --body <file.json>`, never `--body` alone.",
    state: "obsolete",
    reason:
      'the audit reports that the --body examples do not run because --name is a commander option. `applyBodySatisfiesRequired` deleted that: it walks the finished tree, clears the mandatory bit on --name, and re-imposes the requirement in a preAction hook that has already resolved --body, BACKFILLING name into the option store. So `workflow create --body \'{"name":"Pipeline"}\'` parses, reaches the action with opts.name set, and sends the request — verified by parse, not by reading the action. The action\'s own merge is NOT what saves it, and describing it that way is what made a reader conclude the parser still refuses. Only a body missing name AND no --name flag is refused, by a message naming both paths. There is no line to place.'
  },
  {
    id: "workflow-02",
    target: "workflow create",
    summary:
      "say that the placeholder trigger's NODE ID is not in the create response — you must run `workflow get` to read it before `workflow trigger` or any no…",
    state: "placed",
    leaf: "workflow create",
    probe: "THE PLACEHOLDER'S NODE ID IS NOT IN THIS RESPONSE"
  },
  {
    id: "workflow-03",
    target: "workflow trigger",
    summary:
      "document the response shape {node:{id,type,data,configStatus,deletable}, reconnectedEdges:[]} — the new trigger's id lives at .node.id.",
    state: "placed",
    leaf: "workflow trigger",
    probe: "THE NEW TRIGGER'S ID IS AT .node.id"
  },
  {
    id: "workflow-04",
    target: "workflow trigger",
    summary:
      'cross-reference the second step concretely for agentInputTrigger — `node update <wf> <trigger> --body \'{"data":{"parameters":{...}}}\'` is what makes…',
    state: "placed",
    leaf: "workflow trigger",
    probe: "STEP TWO IS data.parameters AND IT IS LOAD-BEARING"
  },
  {
    id: "workflow-05",
    target: "workflow node create",
    summary:
      "warn that a customScript is created WITH a default `code` stub and still reports configStatus incomplete / missingFields ['code'] until you write rea…",
    state: "placed",
    leaf: "workflow node create",
    probe: "ARRIVES WITH A PLACEHOLDER FUNCTION BODY"
  },
  {
    id: "workflow-06",
    target: "workflow node create",
    summary:
      "cross-reference `workflow validate` here — it is the command that catches the invalid {{refs}} this endpoint accepts.",
    state: "placed",
    leaf: "workflow node create",
    probe: "is the\n  only command that names it"
  },
  {
    id: "workflow-07",
    target: "workflow node update",
    summary:
      "state the precondition plainly — the body MUST contain `data` or `parentId`; extra top-level keys are ignored only when one of those is also present,…",
    state: "placed",
    leaf: "workflow node update",
    probe: "THE BODY MUST CARRY ONE OF THEM"
  },
  {
    id: "workflow-08",
    target: "workflow branch create",
    summary:
      "note that adding branches does not make the branching node valid — it still requires data.instructions, set with `node update`.",
    state: "placed",
    leaf: "workflow branch create",
    probe: "BRANCHES DO NOT MAKE THE NODE VALID"
  },
  {
    id: "workflow-09",
    target: "workflow branch create",
    summary:
      "name the exact follow-up for conditions — the logic entry created for the branch lives at node data.logic[] keyed by branchId, and `field` must be an…",
    state: "placed",
    leaf: "workflow branch create",
    probe: "field IS AN OBJECT, NEVER A STRING"
  },
  {
    id: "workflow-10",
    target: "workflow branch list",
    summary:
      "say that branch ids are only unique at creation time and recommend addressing branches by NAME through this command, re-reading ids after any delete.",
    state: "placed",
    leaf: "workflow branch list",
    probe: "READ IDS FROM HERE, ALWAYS"
  },
  {
    id: "workflow-11",
    target: "workflow edge create",
    summary:
      "cross-reference `branch delete` — it removes every edge using that branch as sourceHandle, so the branch's downstream must be re-wired afterwards.",
    state: "placed",
    leaf: "workflow edge create",
    probe: "DELETES EDGES TOO"
  },
  {
    id: "workflow-12",
    target: "workflow validate",
    summary:
      "say this is the ONLY command that reports invalid {{node.field}} references — overview, node get and publish all pass a workflow that carries them.",
    state: "placed",
    leaf: "workflow validate",
    probe: "THE ONLY COMMAND IN THE CLI THAT MAKES THAT CHECK"
  },
  {
    id: "workflow-13",
    target: "workflow publish",
    summary:
      "add the post-publish verification line — re-read `workflow get` and compare nodes to publishedNodes, since edits after a publish leave the live snaps…",
    state: "placed",
    leaf: "workflow publish",
    probe: "publishedNodes matches nodes"
  },
  {
    id: "workflow-14",
    target: "workflow delete",
    summary:
      "state that archiving is terminal for the CLI — there is no destroy verb, so every archived workflow is a permanent row in `list --status ARCHIVED`.",
    state: "placed",
    leaf: "workflow delete",
    probe: "ARCHIVING IS THE END OF THE ROAD"
  },
  {
    id: "workflow-15",
    target: "workflow list",
    summary:
      "document the --json envelope {data:[...], meta:{total,page,paging}} — it differs from `task list`, which returns a bare array.",
    state: "placed",
    leaf: "workflow list",
    probe: "NOT A BARE ARRAY"
  },
  {
    id: "workspace-01",
    target: "workspace",
    summary: "say how files GET INTO a workspace — the namespace has no write verb",
    state: "placed",
    leaf: "workspace",
    probe: "THERE IS NO UPLOAD VERB HERE"
  },
  {
    id: "workspace-02",
    target: "workspace create",
    summary: "show the `--` separator for a name starting with a hyphen",
    state: "placed",
    leaf: "workspace create",
    probe: "A NAME STARTING WITH A HYPHEN NEVER REACHES THAT REFUSAL"
  },
  {
    id: "workspace-03",
    target: "workspace search",
    summary: "document the --json field names",
    state: "placed",
    leaf: "workspace search",
    probe: "--json IS THE RAW SERVER OBJECT, NOT A {data, meta} ENVELOPE"
  },
  {
    id: "workspace-04",
    target: "workspace search",
    summary: "cross-reference it from `workspace mount` as the no-mount alternative",
    state: "placed",
    leaf: "workspace mount",
    probe: 'MOUNTING TO ANSWER "IS THAT FILE THERE" IS THE EXPENSIVE WAY'
  },
  {
    id: "workspace-05",
    target: "workspace restore",
    summary: "give the delete-then-restore round trip as an example",
    state: "placed",
    leaf: "workspace restore",
    probe: "THIS IS THE UNDO FOR AN OPERATION THIS NAMESPACE CANNOT PERFORM"
  },
  {
    id: "workspace-06",
    target: "workspace status",
    summary: "tell the reader to use --json when paths matter",
    state: "obsolete",
    reason:
      'the audit reports that a truncated path in the table is indistinguishable from another, so --json is the only safe read. `chooseFit` refuses any fit that would make two distinct cells render the same text, and `fitCell` marks every cut with an ellipsis \u2014 so a shortened path announces itself and never collides. The audit\'s own four-identical-mounts case is a regression test in `output.test.ts`, "keeps four mounts under one long prefix distinguishable". The defect the line would warn about is gone.'
  },
  {
    id: "workspace-07",
    target: "workspace unmount",
    summary: "say the mount-point DIRECTORY survives the unmount",
    state: "placed",
    leaf: "workspace unmount",
    probe: "THE MOUNT-POINT DIRECTORY SURVIVES, EMPTY"
  },
  {
    id: "workspace-08",
    // The warning became a BEHAVIOUR (NEX-3872): the mount reads the storage
    // kind and mounts a CODE workspace read-only instead of mounting it
    // read-write and letting the gateway refuse each save. The old probe —
    // "A CODE WORKSPACE MOUNTS READ-WRITE AND THEN REFUSES EVERY WRITE" —
    // documented the defect, so it had to go when the defect did. This row
    // stays placed because the help must still say a CODE workspace cannot be
    // written to; only the sentence changed.
    target: "workspace mount",
    summary: "say that a CODE workspace is mounted read-only and cannot be written",
    state: "placed",
    leaf: "workspace mount",
    probe: "A CODE WORKSPACE IS MOUNTED READ-ONLY FOR YOU"
  },
  {
    id: "workspace-09",
    target: "workspace delete",
    summary: "say that a workspace backing a Vibe app is a CODE projection",
    state: "placed",
    leaf: "workspace delete",
    probe: "A CODE WORKSPACE USUALLY BACKS A VIBE APP"
  }
];

/**
 * Namespaces whose EVERY row has been read against the real `--help`.
 *
 * This is what makes `open` mean something. Outside this list an `open` row is
 * un-examined; inside it, the leaf was read and the line is genuinely absent.
 *
 * ⚠️ SHRINK-ONLY IN THE SENSE THAT MATTERS: a namespace never leaves this list
 * because someone found more work in it. It leaves only if its rows stop being
 * a description of the tree — which is a red in the spec, not an edit here.
 */
export const REVIEWED_NAMESPACES: readonly string[] = [
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
  "collection",
  "conversation",
  "credential",
  "cross-cutting",
  "custom-model",
  "customer",
  "deployment",
  "docs",
  "document",
  "emulator",
  "execution",
  "external-tool",
  "folder",
  "global",
  "html-template",
  "model",
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
  "vibe",
  "workflow",
  "workspace"
];
