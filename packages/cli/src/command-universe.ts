import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Command, type Option } from "commander";

import { asDerivedCapture } from "./util/version-check";

/**
 * THE COMMAND UNIVERSE — every leaf `nexus` can run, derived from the tree.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/sweep.sh` executes a set of read-only leaves against a live API and
 * fails CI when one of them regresses. A sweep is only ever evidence about the
 * commands it KNOWS ABOUT, so the load-bearing question is never "did the safe
 * leaves pass" but "are those still all of them". No count is written down in
 * this file, deliberately: a figure in prose beside a table that moves is the
 * same stale list this module exists to delete, one layer up. Run
 * `tsx scripts/command-universe.ts --check-drift` and read the number it
 * derives.
 *
 * That question has exactly one honest source: the commander program tree. A
 * hand-written list of command paths beside an evolving CLI is the defect this
 * module deletes — it goes stale in complete silence, and a sweep over a stale
 * list reads identically to a sweep over a complete one.
 *
 * So the POPULATION is derived and the CLASSIFICATION is declared:
 *
 *   - `deriveCommandModules()` walks the real tree, ONCE. A new command is in
 *     the population the moment it is registered. Nobody has to remember
 *     anything. `deriveCommandNodes()`, `deriveCommandNamespaces()` and
 *     `deriveCommandLeaves()` are projections of that one walk, never second
 *     walks — a docs generator and a classification gate reading two different
 *     walks of one tree is how the two answers start disagreeing.
 *   - {@link COMMAND_CLASSIFICATION} says what may be DONE with each leaf.
 *     Intent cannot be derived — only a human knows that `agent delete` must
 *     never run in a sweep — so it is declared, once, here.
 *   - `classifyCommandUniverse()` diffs the two. An unclassified leaf is a
 *     failure, not a default, so a new command CANNOT be added silently.
 *
 * ── WHY NOT PARSE `--help` ───────────────────────────────────────────────────
 *
 * The previous detector shelled out to `nexus <path> --help` for every node and
 * scraped the rendered text with awk. That reads a RENDERING of the tree rather
 * than the tree: it needs a built `dist/`, spawns one process per node, and any
 * epilogue line that happens to be indented two spaces and start lowercase is
 * indistinguishable from a subcommand. This module reads `command.commands`.
 *
 * 🚨 THE RENDERING OMITS HIDDEN COMMANDS BY CONSTRUCTION, and it also omits the
 * `.alias()` spellings a command answers to. `upgrade.ts` once registered
 * eighteen `{ hidden: true }` top-level commands that all reinstalled the
 * running binary, and a scraper could not see one of them. The tree can. That is
 * not a bug in the awk; it is the reason a rendering can never be the source.
 *
 * ── WHAT A NODE CARRIES, AND WHAT IT DELIBERATELY DOES NOT ───────────────────
 *
 * {@link CommandNode} carries everything derivable from commander ALONE: path,
 * description, aliases, hiddenness, options with their `.choices()`, children,
 * and the rendered help. It carries no v1-contract binding, and that omission is
 * a seam rather than a gap — a consumer that binds commands to the public API
 * contract maps a node into its own richer type and adds that field there. This
 * module is the gate `Tests: Vitest` runs; it must not be able to go red because
 * a contract projection somewhere else broke.
 */

/**
 * How a leaf may be exercised. Three states, and the third is not a synonym for
 * the second — `agent delete` is registration-only (real, just unsafe to fire
 * blind), while `auth logout` must never be reached even by a human running the
 * sweep by hand, because it destroys the credentials the sweep is using.
 */
export type CommandDisposition =
  /** Read-only, needs no required input, emits `--json`. The sweep RUNS these. */
  | "safe"
  /**
   * Registered and real, but not auto-invocable: a mutation, or a read that
   * needs a required positional/option. The sweep asserts it still EXISTS and
   * never executes it.
   */
  | "registration-only"
  /**
   * Executed exactly like `safe`, PLUS the sweep asserts the response is not
   * empty. For a leaf whose route is real but whose organisation holds no rows
   * unless something put them there.
   *
   * 🚨 THE ASSERTION IS THE WHOLE DISPOSITION, and without it this value would
   * be a synonym for `safe` that documents an intention nobody checks. An empty
   * read exercises auth, routing, tenancy scoping and the response envelope
   * while asserting NOTHING about item shape — so a fixture row that someone
   * later deletes turns real coverage back into a green row nobody re-examines,
   * with no event anywhere. That is strictly worse than the honest gap it
   * replaced, because the gap was visible.
   *
   * So: a `safe-with-fixture` leaf that comes back empty is a FAIL, and the
   * remedy is `scripts/seed-sweep-fixtures.sh`, never a demotion to `safe`.
   */
  | "safe-with-fixture"
  /**
   * Never execute, not even by hand during a sweep. Self-modifying, interactive,
   * credential-destroying, or an unbounded arbitrary surface.
   */
  | "never-execute";

export interface DriftReport {
  /** Leaves in the tree that {@link COMMAND_CLASSIFICATION} does not name. */
  readonly unclassified: readonly string[];
  /** Paths classified here that no longer exist in the tree. */
  readonly stale: readonly string[];
  /**
   * What `sweep.sh` EXECUTES, in tree order — `safe` and `safe-with-fixture`
   * together. One list, because the two are executed identically; they differ
   * only in what is asserted about the answer.
   */
  readonly safe: readonly string[];
  /**
   * The subset of {@link safe} whose response must not be empty.
   *
   * A separate list rather than a flag on each entry because `sweep.sh` reads
   * it: bash has no record type, and a second `--print-*` mode it can read line
   * by line is the whole interface.
   */
  readonly fixtureBacked: readonly string[];
  /** Every leaf the tree currently has. */
  readonly observed: readonly string[];
}

/**
 * WHAT MAY BE DONE WITH EACH LEAF. Declared, never derived.
 *
 * ⚠️ ADDING A LINE HERE IS PART OF ADDING A COMMAND, and the spec beside this
 * file is what makes that mandatory rather than polite. Deleting a line is
 * never how a red build is fixed: a leaf that vanishes from the tree is either
 * a rename to reflect here or a regression to revert.
 *
 * Default to `registration-only` when unsure. It is the honest answer for
 * anything that mutates or needs an argument, and it costs the sweep nothing.
 * Reach for `safe` ONLY when all three hold: no required positional, no
 * required option, and `--json` on a read.
 *
 * 🚨 THOSE THREE ARE NECESSARY AND NOT SUFFICIENT, AND READING THE HELP CANNOT
 * SETTLE THEM. Measured over every `registration-only` leaf on 2026-08-18: 75
 * declared no required positional and no `(required)` option in their rendered
 * `--help`, and invoking them against staging refused four of the reads
 * outright — three `cloud-import` leaves want `--connection-id` and
 * `conversation search` wants `--query`, none of which the help text marks the
 * way the others do. The same probe read two leaves ALREADY classified `safe`
 * as needing input, so the help is wrong in both directions.
 *
 * So the promotion test is an INVOCATION against a live environment, never a
 * re-reading. A candidate earns `safe` when it exits 0, emits parseable JSON,
 * and comes back with data — and these are the shapes that pass the first two
 * and prove nothing:
 *
 *   - EXIT 0 AND NOT JSON. `--strict` promotes the WARN to a FAIL, so this
 *     turns the gate red rather than covering anything. `analytics export` and
 *     `cue export` are both this today.
 *   - A 403 the SKIP grep does not match. It matches "not configured",
 *     "feature is disabled" and "feature not enabled"; the `agent-eval` tree
 *     answers "This feature is not enabled", which matches none of the three
 *     and lands as a FAIL.
 *   - AN EMPTY COLLECTION. It exercises auth, routing, tenancy scoping and the
 *     envelope, and it asserts nothing whatever about item shape. Six leaves
 *     already classified `safe` read empty against staging, so this is a REASON
 *     TO SEED A FIXTURE rather than a rule anything currently enforces.
 *
 * 🚨 AND ONE SHAPE IS REFUSED NO MATTER HOW WELL IT READS: a leaf that RETURNS
 * A CREDENTIAL. `vibe git-credentials` takes no input, exits 0 and emits clean
 * JSON — it meets every test above — and what it emits is the organisation's
 * git push token. `sweep.sh` prints the first 100 characters of a leaf's output
 * into the CI log on failure, and a CI log is readable by anyone with repository
 * access. It stays `registration-only` for that reason and not for any other, so
 * do not promote it on a later pass that only re-checks the input rules.
 */
export const COMMAND_CLASSIFICATION: Readonly<Record<string, CommandDisposition>> = {
  // ── access-card ────────────────────────────────────────────────────────────
  "access-card available-actions": "registration-only",
  "access-card create": "registration-only",
  "access-card delete": "registration-only",
  "access-card get": "registration-only",
  "access-card list": "registration-only",
  "access-card update": "registration-only",

  // ── admin ──────────────────────────────────────────────────────────────────
  "admin vibe-build-job claim": "registration-only",
  "admin vibe-build-job fail": "registration-only",
  "admin vibe-build-job succeed": "registration-only",
  "admin vibe-build-job time-out": "registration-only",
  "admin vibe-build-job-timeout-sweep trigger": "registration-only",
  "admin vibe-build-runner tick": "registration-only",
  "admin vibe-consumption-cap get": "registration-only",
  "admin vibe-consumption-cap set": "registration-only",
  "admin vibe-cost-safety get": "registration-only",
  "admin vibe-cost-safety list": "registration-only",
  "admin vibe-cost-safety set": "registration-only",
  "admin vibe-deployment await-approval": "registration-only",
  "admin vibe-deployment begin-deploy": "registration-only",
  "admin vibe-deployment build-succeeded": "registration-only",
  "admin vibe-deployment mark-failed": "registration-only",
  "admin vibe-deployment mark-healthy": "registration-only",
  "admin vibe-deployment mark-rolled-back": "registration-only",
  "admin vibe-deployment-runner tick": "registration-only",
  "admin vibe-rollback-sweep trigger": "registration-only",
  "admin vibe-tenant-cluster disable": "registration-only",
  "admin vibe-tenant-cluster provision": "registration-only",

  // ── agent ──────────────────────────────────────────────────────────────────
  "agent create": "registration-only",
  "agent delete": "registration-only",
  "agent duplicate": "registration-only",
  "agent generate-profile-picture": "registration-only",
  "agent get": "registration-only",
  "agent list": "safe",
  "agent update": "registration-only",
  "agent upload-profile-picture": "registration-only",

  // ── agent-collection ───────────────────────────────────────────────────────
  "agent-collection attach": "registration-only",
  "agent-collection detach": "registration-only",
  "agent-collection list": "registration-only",

  // ── agent-eval ─────────────────────────────────────────────────────────────
  "agent-eval batch create": "registration-only",
  "agent-eval batch get": "registration-only",
  "agent-eval batch list": "registration-only",
  "agent-eval run abort": "registration-only",
  "agent-eval run compare": "registration-only",
  "agent-eval run create": "registration-only",
  "agent-eval run delete": "registration-only",
  "agent-eval run execute": "registration-only",
  "agent-eval run get": "registration-only",
  "agent-eval run list": "registration-only",
  "agent-eval run results": "registration-only",
  "agent-eval run transcript": "registration-only",
  "agent-eval schedule create": "registration-only",
  "agent-eval schedule delete": "registration-only",
  "agent-eval schedule list": "registration-only",
  "agent-eval schedule pause": "registration-only",
  "agent-eval schedule resume": "registration-only",
  "agent-eval schedule update": "registration-only",
  "agent-eval template attach": "registration-only",
  "agent-eval template clone": "registration-only",
  "agent-eval template create": "registration-only",
  "agent-eval template delete": "registration-only",
  "agent-eval template detach": "registration-only",
  "agent-eval template get": "registration-only",
  "agent-eval template importable": "registration-only",
  "agent-eval template list": "registration-only",
  "agent-eval template update": "registration-only",
  "agent-eval trigger delete": "registration-only",
  "agent-eval trigger list": "registration-only",
  "agent-eval trigger upsert": "registration-only",
  "agent-eval webhook delete": "registration-only",
  "agent-eval webhook get": "registration-only",
  "agent-eval webhook upsert": "registration-only",

  // ── agent-skill ────────────────────────────────────────────────────────────
  "agent-skill add-preset": "registration-only",
  "agent-skill create": "registration-only",
  "agent-skill delete": "registration-only",
  "agent-skill download": "registration-only",
  "agent-skill get": "registration-only",
  "agent-skill list": "registration-only",
  "agent-skill presets": "safe",
  "agent-skill update": "registration-only",
  "agent-skill upload": "registration-only",

  // ── agent-tool ─────────────────────────────────────────────────────────────
  "agent-tool attach-collection": "registration-only",
  "agent-tool create": "registration-only",
  "agent-tool delete": "registration-only",
  "agent-tool get": "registration-only",
  "agent-tool list": "registration-only",
  "agent-tool update": "registration-only",

  // ── analytics ──────────────────────────────────────────────────────────────
  "analytics export": "registration-only",
  "analytics feedback": "safe",
  "analytics metrics": "registration-only",
  "analytics overview": "safe",
  "analytics query": "registration-only",

  // ── api ────────────────────────────────────────────────────────────────────
  api: "never-execute", // accepts any HTTP verb against any path — unbounded by construction

  // ── asset ──────────────────────────────────────────────────────────────────
  "asset delete": "registration-only",
  "asset get": "registration-only",
  "asset list": "safe-with-fixture",
  "asset upload": "registration-only",

  // ── auth ───────────────────────────────────────────────────────────────────
  "auth list": "safe",
  "auth login": "never-execute", // writes credentials
  "auth logout": "never-execute", // destroys the credentials the sweep is authenticated with
  "auth orgs": "safe",
  "auth pin": "never-execute", // writes .nexusrc
  "auth status": "never-execute", // already spent in the sweep's own preflight
  "auth switch": "never-execute", // flips the active profile out from under the sweep
  "auth unpin": "never-execute", // deletes .nexusrc
  "auth use-org": "never-execute", // repoints the profile at another organization
  "auth whoami": "safe",

  // ── channel ────────────────────────────────────────────────────────────────
  "channel connect-waba": "registration-only",
  "channel connection create": "registration-only",
  "channel connection list": "safe",
  "channel setup": "registration-only",
  "channel whatsapp-sender create": "registration-only",
  "channel whatsapp-sender get": "registration-only",
  "channel whatsapp-sender list": "safe",
  "channel whatsapp-template approvals": "registration-only",
  "channel whatsapp-template create": "registration-only",
  "channel whatsapp-template delete": "registration-only",
  "channel whatsapp-template get": "registration-only",
  "channel whatsapp-template list": "safe",
  "channel whatsapp-template submit-approval": "registration-only",
  "channel whatsapp-template test-send": "registration-only",

  // ── claude-code ────────────────────────────────────────────────────────────
  "claude-code install": "never-execute", // writes files into the caller's ~/.claude
  "claude-code list": "safe",

  // ── cloud-import ───────────────────────────────────────────────────────────
  "cloud-import browse": "registration-only",
  "cloud-import google-drive import": "registration-only",
  "cloud-import google-drive list-files": "registration-only",
  "cloud-import import": "registration-only",
  "cloud-import notion import": "registration-only",
  "cloud-import notion search": "registration-only",
  "cloud-import providers": "safe",
  "cloud-import search": "registration-only",
  "cloud-import sharepoint import": "registration-only",
  "cloud-import sharepoint list-files": "registration-only",

  // ── collection ─────────────────────────────────────────────────────────────
  "collection attach-documents": "registration-only",
  "collection create": "registration-only",
  "collection delete": "registration-only",
  "collection documents": "registration-only",
  "collection get": "registration-only",
  "collection list": "safe",
  "collection query": "registration-only",
  "collection remove-document": "registration-only",
  "collection search": "registration-only",
  "collection search-multiple": "registration-only",
  "collection stats": "registration-only",
  "collection update": "registration-only",

  // ── conversation ───────────────────────────────────────────────────────────
  "conversation assign": "registration-only",
  "conversation assigned-users": "registration-only",
  "conversation close": "registration-only",
  "conversation comment": "registration-only",
  "conversation comments": "registration-only",
  "conversation get": "registration-only",
  "conversation get-metadata": "registration-only",
  "conversation list": "safe",
  "conversation mark-as-read": "registration-only",
  "conversation messages": "registration-only",
  "conversation search": "registration-only",
  "conversation send-message": "registration-only",
  "conversation send-template": "registration-only",
  "conversation update-metadata": "registration-only",
  "conversation update-status": "registration-only",
  "conversation update-topic": "registration-only",

  // ── credential ─────────────────────────────────────────────────────────────
  "credential delete": "registration-only",
  "credential get": "registration-only",
  "credential list": "safe",
  "credential update": "registration-only",

  // ── cue ────────────────────────────────────────────────────────────────────
  // `export` is read-only and needs no input, but it would not be swept even
  // once its route is live: it is rate limited to 5 requests per minute per
  // organization and a bare invocation pulls the org's whole transcript corpus
  // to stdout. A sweep firing it every run would spend the limit a real export
  // needs and move megabytes to do it.
  //
  // `cue conversations` is `safe` by every property the disposition describes —
  // read-only, no required input, emits `--json` — and `GET /public/v1/cue/
  // conversations` answers 200 on staging, so the sweep watches it.
  "cue conversations": "safe",
  "cue export": "registration-only",
  "cue transcript": "registration-only",

  // ── custom-model ───────────────────────────────────────────────────────────
  "custom-model create": "registration-only",
  "custom-model delete": "registration-only",
  "custom-model get": "registration-only",
  "custom-model list": "safe",
  "custom-model update": "registration-only",

  // ── customer ───────────────────────────────────────────────────────────────
  "customer create": "registration-only",
  "customer delete": "registration-only",
  "customer get": "registration-only",
  "customer get-by-external-id": "registration-only",
  "customer list": "safe",
  "customer note": "registration-only",
  "customer update": "registration-only",

  // ── deployment ─────────────────────────────────────────────────────────────
  "deployment create": "registration-only",
  "deployment delete": "registration-only",
  "deployment duplicate": "registration-only",
  "deployment embed-config": "registration-only",
  "deployment embed-config-update": "registration-only",
  "deployment folder assign": "registration-only",
  "deployment folder create": "registration-only",
  "deployment folder delete": "registration-only",
  "deployment folder list": "safe",
  "deployment folder update": "registration-only",
  "deployment get": "registration-only",
  "deployment list": "safe",
  "deployment stats": "registration-only",
  "deployment template attach": "registration-only",
  "deployment template detach": "registration-only",
  "deployment template list": "registration-only",
  "deployment template settings": "registration-only",
  "deployment template update": "registration-only",
  "deployment update": "registration-only",

  // ── docs ───────────────────────────────────────────────────────────────────
  "docs search": "never-execute", // interactive topic browser

  // ── document ───────────────────────────────────────────────────────────────
  "document add-website": "registration-only",
  "document children": "registration-only",
  "document create-folder": "registration-only",
  "document create-google-sheet": "registration-only",
  "document create-text": "registration-only",
  "document delete": "registration-only",
  "document download": "registration-only",
  "document get": "registration-only",
  "document list": "safe",
  "document preview": "registration-only",
  "document reprocess": "registration-only",
  "document update": "registration-only",
  "document upload": "registration-only",

  // ── emulator ───────────────────────────────────────────────────────────────
  "emulator scenario delete": "registration-only",
  "emulator scenario get": "registration-only",
  "emulator scenario list": "registration-only",
  "emulator scenario replay": "registration-only",
  "emulator scenario save": "registration-only",
  "emulator send": "never-execute", // pushes a message into a live emulator session
  "emulator session create": "registration-only",
  "emulator session delete": "registration-only",
  "emulator session get": "registration-only",
  "emulator session list": "registration-only",

  // ── execution ──────────────────────────────────────────────────────────────
  "execution cancel": "registration-only",
  "execution diagnose": "registration-only",
  "execution export": "registration-only",
  "execution follow": "registration-only",
  "execution get": "registration-only",
  "execution list": "safe",
  "execution node-result": "registration-only",
  "execution output": "registration-only",
  "execution poll": "registration-only",
  "execution retry": "registration-only",

  // ── external-tool ──────────────────────────────────────────────────────────
  "external-tool create": "registration-only",
  "external-tool delete": "registration-only",
  "external-tool execute": "registration-only",
  "external-tool get": "registration-only",
  "external-tool initiate-oauth": "never-execute", // opens a browser OAuth flow
  "external-tool list": "safe",
  "external-tool test": "registration-only",
  "external-tool test-auth": "registration-only",
  "external-tool update": "registration-only",
  "external-tool update-auth": "registration-only",
  "external-tool update-spec": "registration-only",
  "external-tool upload-icon": "registration-only",

  // ── folder ─────────────────────────────────────────────────────────────────
  "folder assign": "registration-only",
  "folder create": "registration-only",
  "folder delete": "registration-only",
  "folder list": "safe",
  "folder update": "registration-only",

  // ── html-template ──────────────────────────────────────────────────────────
  "html-template create": "registration-only",
  "html-template delete": "registration-only",
  "html-template fill": "registration-only",
  "html-template get": "registration-only",
  "html-template list": "safe-with-fixture",
  "html-template render": "registration-only",
  "html-template update": "registration-only",

  // ── known-issues ───────────────────────────────────────────────────────────
  // A read, and it mutates nothing — but it takes a REQUIRED positional, so the
  // sweep has no value it could supply. `registration-only` is what a required
  // argument means here, not a judgement about the call being unsafe.
  "known-issues": "registration-only",

  // ── mcp ────────────────────────────────────────────────────────────────────
  // `call` dispatches whatever tool name it is handed against the real Public
  // API, so it is `nexus api`'s class rather than a typed verb's: unbounded by
  // construction, and the sweep must never fire one blind. `serve` reads stdin
  // until it closes and speaks a wire protocol on stdout — nothing a sweep can
  // drive. `install` writes a config file outside this directory under --apply.
  "mcp call": "never-execute",
  "mcp install": "registration-only",
  "mcp serve": "never-execute",
  "mcp tools get": "registration-only",
  "mcp tools list": "safe",

  // ── model ──────────────────────────────────────────────────────────────────
  "model list": "safe",

  // ── permissions ────────────────────────────────────────────────────────────
  "permissions access": "registration-only",
  "permissions grant": "registration-only",
  "permissions org-settings": "safe",
  "permissions revoke": "registration-only",
  "permissions set-visibility": "registration-only",

  // ── phone-number ───────────────────────────────────────────────────────────
  "phone-number buy": "registration-only",
  "phone-number get": "registration-only",
  "phone-number list": "safe",
  "phone-number release": "registration-only",
  "phone-number search": "registration-only",

  // ── prompt-assistant ───────────────────────────────────────────────────────
  // Read-only, but it takes a thread id AND holds the connection for up to 55s
  // — a sweep that ran it would spend a minute per invocation waiting on a
  // thread that does not exist.
  "prompt-assistant await-thread": "registration-only",
  "prompt-assistant chat": "never-execute", // interactive REPL
  "prompt-assistant delete-thread": "registration-only",
  "prompt-assistant get-thread": "registration-only",
  "prompt-assistant list-threads": "safe",

  // ── role ───────────────────────────────────────────────────────────────────
  "role access-requests": "registration-only",
  "role add-member": "registration-only",
  "role add-permission-set-member": "registration-only",
  "role add-responsibility": "registration-only",
  "role attach": "registration-only",
  "role automation-settings": "safe",
  "role collection-grants": "registration-only",
  "role coverage": "registration-only",
  "role create": "registration-only",
  "role create-job-type": "registration-only",
  "role create-permission-set": "registration-only",
  "role creation-request": "registration-only",
  "role creation-requests": "registration-only",
  "role delete": "registration-only",
  "role delete-job-type": "registration-only",
  "role delete-permission-set": "registration-only",
  "role deletion-request": "registration-only",
  "role deletion-requests": "registration-only",
  "role detach": "registration-only",
  "role get": "registration-only",
  "role governance": "safe",
  "role grant-collection": "registration-only",
  "role grant-workspace": "registration-only",
  "role job-types": "safe-with-fixture",
  "role list": "safe",
  "role add-board": "registration-only",
  // Every board verb needs a Role argument, so none can be swept. The reads are
  // no exception: `role boards` takes one too.
  "role boards": "registration-only",
  "role members": "registration-only",
  "role move-card": "registration-only",
  "role remove-board": "registration-only",
  "role reorder-boards": "registration-only",
  "role update-board": "registration-only",
  "role permission-sets": "registration-only",
  // Both are real and both are unsafe to fire in a sweep: `pause` stops a live
  // organization's workflows and agents, and `resume` would restart work
  // somebody deliberately stopped.
  "role pause": "registration-only",
  "role resume": "registration-only",
  "role remove-member": "registration-only",
  "role remove-permission-set-member": "registration-only",
  "role remove-responsibility": "registration-only",
  "role request-access": "registration-only",
  "role responsibilities": "registration-only",
  "role review-access": "registration-only",
  "role review-creation-request": "registration-only",
  "role review-deletion-request": "registration-only",
  "role revoke-collection": "registration-only",
  "role revoke-workspace": "registration-only",
  "role scope-lines": "registration-only",
  "role set-automation-settings": "registration-only",
  "role set-scope-lines": "registration-only",
  "role set-system-policy": "registration-only",
  "role set-task-duties": "registration-only",
  "role set-tasks": "registration-only",
  "role set-variables": "registration-only",
  "role set-working-year": "registration-only",
  "role system-policy": "registration-only",
  "role systems": "registration-only",
  "role task-duties": "registration-only",
  "role tasks": "registration-only",
  "role update": "registration-only",
  "role update-job-type": "registration-only",
  "role update-permission-set": "registration-only",
  "role variables": "registration-only",
  "role working-year": "registration-only",
  "role workspace-grants": "registration-only",

  // ── skill-folder ───────────────────────────────────────────────────────────
  "skill-folder assign": "registration-only",
  "skill-folder create": "registration-only",
  "skill-folder delete": "registration-only",
  "skill-folder list": "safe",
  "skill-folder update": "registration-only",

  // ── skills ─────────────────────────────────────────────────────────────────
  "skills list": "safe",
  "skills update": "never-execute", // writes skills + CLAUDE.md into the caller's project
  "skills version": "safe",
  "skills where": "safe",

  // ── task ───────────────────────────────────────────────────────────────────
  "task create": "registration-only",
  "task delete": "registration-only",
  "task duplicate": "registration-only",
  "task execute": "registration-only",
  "task get": "registration-only",
  "task list": "safe",
  "task update": "registration-only",

  // ── task-eval ──────────────────────────────────────────────────────────────
  "task-eval dataset add": "registration-only",
  "task-eval dataset list": "registration-only",
  "task-eval execute": "registration-only",
  "task-eval formats": "safe",
  "task-eval judge": "registration-only",
  "task-eval judges": "safe",
  "task-eval results": "registration-only",
  "task-eval session create": "registration-only",
  "task-eval session delete": "registration-only",
  "task-eval session get": "registration-only",
  "task-eval session list": "registration-only",

  // ── template ───────────────────────────────────────────────────────────────
  "template create": "registration-only",
  "template folder assign": "registration-only",
  "template folder create": "registration-only",
  "template folder delete": "registration-only",
  "template folder list": "safe-with-fixture",
  "template folder update": "registration-only",
  "template generate": "registration-only",
  "template get": "registration-only",
  "template list": "safe",
  "template upload": "registration-only",

  // ── ticket ─────────────────────────────────────────────────────────────────
  "ticket attach": "registration-only",
  "ticket attachments": "registration-only",
  "ticket close": "registration-only",
  "ticket comment": "registration-only",
  "ticket comments": "registration-only",
  "ticket create": "registration-only",
  "ticket get": "registration-only",
  "ticket list": "safe",
  "ticket update": "registration-only",

  // ── tool ───────────────────────────────────────────────────────────────────
  "tool connect": "never-execute", // opens a browser OAuth flow
  "tool connection-status": "registration-only",
  "tool create-credential": "registration-only",
  "tool credentials": "registration-only",
  "tool delete-credential": "registration-only",
  "tool execute": "registration-only",
  "tool get": "registration-only",
  "tool resolve-options": "registration-only",
  "tool search": "safe",
  "tool skills": "safe",
  "tool test": "registration-only",

  // ── tracing ────────────────────────────────────────────────────────────────
  "tracing cost-breakdown": "safe",
  "tracing delete": "registration-only",
  "tracing export": "registration-only",
  "tracing export-bulk": "safe",
  "tracing generation": "registration-only",
  "tracing generations": "safe",
  "tracing models": "safe",
  "tracing summary": "safe",
  "tracing timeline": "safe",
  "tracing trace": "registration-only",
  "tracing traces": "safe",
  // ── tracks ─────────────────────────────────────────────────────────────────
  // ONE LEAF HERE IS `safe`, AND THE RATIO IS THE DOMAIN RATHER THAN CAUTION.
  // `tracks ready` is the only verb here that needs no argument: every other
  // read is scoped to a track or a task the sweep has no id for, and every write
  // changes a plan. A sweep that ran them would be authoring work items.
  //
  // `GET /public/v1/tracks/ready` answers 200 on staging, so `tracks ready` is
  // `safe` and the sweep watches it. It is `safe` rather than
  // `safe-with-fixture` deliberately: staging holds no ready tracks, so the
  // route answers `{"tracks":[]}`, and `--require-non-empty` scores that EMPTY
  // and FAILs. An empty list is the correct answer here — this leaf proves the
  // route is alive and shaped like JSON, never that any item exists.
  //
  // 🔴 WHEN A LEAF'S ROUTE IS NOT ON STAGING YET, THE DISPOSITION IS THE LEVER —
  // NEVER `sweep.sh`'s SKIP MATCH. A 404 from a route that used to exist is
  // exactly the regression the sweep exists to catch, and a SKIP wide enough to
  // swallow one blinds it to every deleted route. Park such a leaf
  // `registration-only`, and write the flip-back as a RULE carrying its probe,
  // never as a note about somebody's intention to remember:
  //
  //   THIS LEAF IS `registration-only` WHILE <ROUTE> ANSWERS 404 ON STAGING,
  //   AND `safe` ONCE IT ANSWERS 200.
  //
  // The probe has to NAME THE HOST. `--env` recognises only `dev` and
  // `production` — `URL_MAP` in config.ts has no `staging` key — and a
  // `--profile staging` is local config that no checkout ships, so a probe
  // written that way runs for whoever happens to have made one and for nobody
  // else. This is why the sweep workflow sets `NEXUS_BASE_URL` explicitly:
  //
  //   NEXUS_API_KEY=<a staging key> NEXUS_BASE_URL=https://api-staging.gpt.nexus \
  //     pnpm exec tsx src/index.ts api GET <route>
  //
  // Read the STATUS, and carry a control — a neighbouring path that must answer
  // 404, so a probe that would report 200 for anything is caught before it
  // decides a disposition.
  //
  // A note without a probe does not fire, because nothing about it can.
  //
  // On 200, change the value and move the TWO artifacts a disposition feeds:
  // `pnpm run gen:cli-surface` (each row carries its disposition, and the
  // header census with it) and `COMPATIBILITY.md`'s `classified safe` count,
  // which is a published figure a test derives. `gen:json-shape` reads the
  // contract rather than this table, so a flip leaves it untouched —
  // `gen:json-shape --check` says so without writing. A `src/**` change here
  // also needs a changeset naming `@agent-nexus/cli`.
  //
  // Leaving a leaf parked once its route answers is a read-only leaf the sweep
  // has stopped watching, which is the silent half of this disposition rather
  // than a tidy backlog item.
  "tracks ready": "safe",
  "tracks dependency add": "registration-only",
  "tracks section create": "registration-only",
  "tracks section rename": "registration-only",
  "tracks task ready": "registration-only",
  "tracks task get": "registration-only",
  // A MUTATION, so existence only. It also OVERWRITES a claim another agent
  // holds, by design, which is the last thing a sweep should run for real.
  "tracks task claim": "registration-only",
  "tracks task toggle": "registration-only",
  "tracks task edge": "registration-only",
  "tracks plan import": "registration-only",
  "tracks agent list": "registration-only",
  "tracks agent open": "registration-only",
  "tracks agent beat": "registration-only",
  "tracks agent close": "registration-only",
  "tracks diary list": "registration-only",
  "tracks diary append": "registration-only",
  "tracks memory list": "registration-only",
  "tracks memory put": "registration-only",
  "tracks memory delete": "registration-only",
  "tracks event list": "registration-only",
  "tracks event append": "registration-only",

  // ── upgrade ────────────────────────────────────────────────────────────────
  // Reinstalls the binary the sweep is running. Its `update`, `latest` and `up`
  // spellings are `.alias()` calls on this one command, so they are not separate
  // leaves and need no separate line.
  upgrade: "never-execute",

  // ── user-group ─────────────────────────────────────────────────────────────
  "user-group add-member": "registration-only",
  "user-group create": "registration-only",
  "user-group delete": "registration-only",
  "user-group list": "safe-with-fixture",
  "user-group remove-member": "registration-only",
  "user-group update": "registration-only",

  // ── version ────────────────────────────────────────────────────────────────
  "version create": "registration-only",
  "version delete": "registration-only",
  "version get": "registration-only",
  "version list": "registration-only",
  "version publish": "registration-only",
  "version restore": "registration-only",
  "version update": "registration-only",

  // ── vibe ───────────────────────────────────────────────────────────────────
  "vibe app attach-repo": "registration-only",
  "vibe app create": "registration-only",
  "vibe app delete": "registration-only",
  "vibe app edge-token": "registration-only",
  "vibe app get": "registration-only",
  "vibe app list": "safe",
  "vibe app logs": "registration-only",
  "vibe app provision-repo": "registration-only",
  "vibe app register-as-tool": "registration-only",
  "vibe app reprovision-repo": "registration-only",
  "vibe app rotate-edge-token": "registration-only",
  "vibe app update": "registration-only",
  "vibe app visibility": "registration-only",
  "vibe approvals decide": "registration-only",
  "vibe approvals get": "registration-only",
  "vibe approvals pending": "registration-only",
  "vibe audit list": "safe",
  "vibe cluster provision": "registration-only",
  "vibe cluster status": "safe",
  "vibe deploy": "registration-only",
  "vibe deploy-state": "registration-only",
  "vibe deployments get": "registration-only",
  "vibe deployments list": "registration-only",
  "vibe env list": "registration-only",
  "vibe env rm": "registration-only",
  "vibe env set": "registration-only",
  "vibe git-credentials": "registration-only",
  "vibe git-project clone": "registration-only",
  "vibe git-project create": "registration-only",
  "vibe git-project delete": "registration-only",
  "vibe git-project get": "registration-only",
  "vibe git-project list": "safe",
  "vibe git-project pull": "registration-only",
  "vibe git-project reprovision": "registration-only",
  "vibe rollback": "registration-only",

  // ── workflow ───────────────────────────────────────────────────────────────
  "workflow batch": "registration-only",
  "workflow branch create": "registration-only",
  "workflow branch delete": "registration-only",
  "workflow branch list": "registration-only",
  "workflow branch update": "registration-only",
  "workflow create": "registration-only",
  "workflow delete": "registration-only",
  "workflow duplicate": "registration-only",
  "workflow edge create": "registration-only",
  "workflow edge delete": "registration-only",
  "workflow get": "registration-only",
  "workflow layout": "registration-only",
  "workflow list": "safe",
  "workflow node create": "registration-only",
  "workflow node delete": "registration-only",
  "workflow node get": "registration-only",
  "workflow node output-format": "registration-only",
  "workflow node reload-props": "registration-only",
  "workflow node test": "registration-only",
  "workflow node test-payload": "registration-only",
  "workflow node update": "registration-only",
  "workflow node variables": "registration-only",
  "workflow node-type": "registration-only",
  "workflow node-types": "safe",
  "workflow overview": "registration-only",
  "workflow platform-listener-events": "safe",
  "workflow publish": "registration-only",
  "workflow test": "registration-only",
  "workflow test-node": "registration-only",
  "workflow trigger": "registration-only",
  "workflow unpublish": "registration-only",
  "workflow update": "registration-only",
  "workflow upload-icon": "registration-only",
  "workflow validate": "registration-only",

  // ── workspace ──────────────────────────────────────────────────────────────
  "workspace create": "registration-only",
  "workspace delete": "registration-only",
  "workspace list": "safe",
  "workspace mount": "never-execute", // mounts a FUSE drive on the caller's filesystem
  "workspace rename": "registration-only",
  "workspace restore": "registration-only",
  "workspace search": "registration-only",
  "workspace status": "registration-only",
  "workspace unmount": "never-execute" // unmounts a drive the caller may be using
};

/**
 * The directory holding one module per command namespace.
 *
 * `__dirname` is unavailable under ESM and `import.meta.url` is a syntax error
 * once tsup emits CJS, so neither can be written literally in a file that is
 * both bundled into `dist/` and imported by vitest. This module is never part
 * of the shipped bundle — only the spec, `scripts/command-universe.ts` and the
 * docs generator import it — so it is free to resolve its own location the ESM
 * way.
 */
function commandsDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "commands");
}

/** A registrar that hangs a whole namespace off the root program. */
type RootRegistrar = (program: Command) => void;

export interface DiscoveredRegistrar {
  /** Basename inside `src/commands/`, e.g. `vibe.ts`. */
  readonly module: string;
  /** Repository-relative path, for a docs page's `sourceRefs` frontmatter. */
  readonly sourcePath: string;
  /** The exported function's name, e.g. `registerVibeCommands`. */
  readonly name: string;
  readonly register: RootRegistrar;
}

/**
 * Every `register*` export in `src/commands/` that attaches to the ROOT program.
 *
 * Arity is the discriminator, and it is a property of the code rather than of a
 * naming convention: a root registrar takes `(program)`, while a nested one —
 * `registerVibeCostSafetyCommands(admin, program)` — takes its parent first and
 * is reached through its own namespace's registrar, never from here. Calling a
 * nested one against the root would graft `vibe-cost-safety` on as a top-level
 * command that does not exist.
 */
export async function discoverRootRegistrars(): Promise<DiscoveredRegistrar[]> {
  const directory = commandsDirectory();
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".conformance.ts"))
    .sort();

  const found: DiscoveredRegistrar[] = [];
  for (const file of files) {
    const loaded: Record<string, unknown> = await import(
      /* @vite-ignore */ pathToFileURL(join(directory, file)).href
    );
    for (const [name, value] of Object.entries(loaded)) {
      if (!/^register[A-Z]\w*$/.test(name)) continue;
      if (typeof value !== "function") continue;
      if (value.length !== 1) continue;
      found.push({
        module: file,
        sourcePath: `packages/cli/src/commands/${file}`,
        name,
        register: value as RootRegistrar
      });
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// The node — what one walk of the tree returns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TWO FACTS COMMANDER HOLDS, READ THROUGH ITS DECLARED SURFACE.
 *
 * Both were reached by asserting a private shape onto a `Command` / `Option`
 * (`as unknown as { _hidden?: boolean }`). An asserted shape is not checked
 * against commander at all, and the failure mode is silence rather than an
 * error: rename the field upstream and the property read yields `undefined`,
 * `undefined === true` is `false`, and every hidden command reports itself
 * VISIBLE. On a module whose entire job is to make the help surface true, a
 * fact that can go wrong without a compiler error is the defect, not the cast.
 *
 * Neither read needs an assertion, so neither has one. Both now go through
 * declarations in commander's own typings, and an upstream change to either is
 * a typecheck failure here.
 */

/**
 * Is this command hidden from every `--help`?
 *
 * `_hidden` is genuinely private and genuinely undeclared. Its PUBLIC
 * equivalent is `Help#visibleCommands`, which is the same filter commander runs
 * to render help — so this asks commander what it would show rather than
 * guessing at how it decides.
 *
 * A command with no parent is never hidden, and that is commander's invariant
 * rather than a convenient default: `_hidden` starts `false` in the constructor
 * and is only ever set by `.command()` / `.addCommand()`, both of which assign
 * `parent` in the same breath. Nothing can be hidden and parentless.
 *
 * ⚠️ THE TREE CURRENTLY REGISTERS NO HIDDEN COMMAND AT ALL, so today this read
 * and the `_hidden` read agree trivially and neither could catch the other being
 * wrong. That is a reason to keep the declared-surface read, not to drop it: the
 * eighteen that used to be here were removed, and the next one added would land
 * on whichever of the two reads this module happens to use.
 */
export const isHiddenCommand = (command: Command): boolean => {
  const parent = command.parent;
  if (parent === null) return false;
  return !parent.createHelp().visibleCommands(parent).includes(command);
};

/**
 * The values `.choices()` declared, or undefined.
 *
 * There is no `choices()` GETTER, which is what the assertion here used to be
 * justified by — but `argChoices` is a declared public field on `Option`, so
 * the getter's absence never made an assertion necessary. Read as declared.
 */
export const optionChoices = (option: Option): readonly string[] | undefined => option.argChoices;

export interface CommandOption {
  readonly flags: string;
  readonly description: string;
  /** `.choices()`, when the option declares them. */
  readonly choices?: readonly string[];
}

export interface CommandNode {
  /** Space-joined path from the ROOT, e.g. `vibe app list`. Keys {@link COMMAND_CLASSIFICATION}. */
  readonly path: string;
  /** The final segment only, e.g. `list`. */
  readonly name: string;
  readonly description: string;
  /** Commander `.alias()` values. Never their own commands — see the note below. */
  readonly aliases: readonly string[];
  /** `true` for a `{ hidden: true }` registration, which no `--help` renders. */
  readonly hidden: boolean;
  /**
   * The rendered `--help` of the REAL root program's command at this path —
   * byte-for-byte what a terminal receives, `addHelpText` blocks included.
   *
   * 🚨 IT IS CAPTURED FROM `buildRootProgram()`, NEVER FROM THE THROWAWAY
   * PROGRAM THE REGISTRAR RAN AGAINST, and that distinction is the whole of this
   * field. `index.ts` installs two help blocks on the FINISHED tree, after every
   * registrar has run — the known-issues pointer and the help-scope footer — so a
   * per-registrar program cannot carry either by construction. Capturing there
   * dropped both lines from all 565 documented paths while the text still read
   * as real `--help` output, and the docblock that used to sit here promised the
   * `addHelpText` blocks were included.
   *
   * {@link helpSource} says which program a given node's text came from. Do not
   * re-apply the root decorations to a throwaway program instead: that is a
   * second list of root-level help registrations to keep in step with
   * `buildRootProgram`, and the next one anyone adds diverges in silence.
   *
   * Lazy and memoized. Capturing it eagerly for all ~582 nodes would put the
   * cost on the classification gate, which never reads it.
   */
  readonly help: string;
  /**
   * Which program {@link help} was captured from.
   *
   * `registrar-fallback` is a REPORTABLE fact, not a graceful degradation: it
   * means the real root program has no command at this path, so the registrar
   * that produced the node is defined and never wired. Its help would read
   * exactly like a real one, which is why the discriminator exists rather than a
   * silent fallback. `docs-help-matches-the-real-cli.test.ts` fails on any node
   * carrying it.
   */
  readonly helpSource: "root-program" | "registrar-fallback";
  readonly options: readonly CommandOption[];
  readonly children: readonly CommandNode[];
  readonly isLeaf: boolean;
  /** The `src/commands/*.ts` basename whose registrar produced this node. */
  readonly sourceModule: string;
}

/**
 * One `src/commands/*.ts` module and every TOP-LEVEL command it registers.
 *
 * Roots are plural and hidden ones are included, because a module may register
 * more than one. `upgrade.ts` registered ONE visible namespace and EIGHTEEN
 * hidden top-level aliases — each a childless `Command` rather than a commander
 * `.alias()`, with nothing distinguishing it from a real command except
 * `hidden`. Those are gone and the shape still carries the fact, because a
 * module registering a hidden root is a thing this walk has to be able to see.
 */
export interface CommandModule {
  readonly sourceModule: string;
  readonly sourcePath: string;
  readonly registrar: string;
  readonly roots: readonly CommandNode[];
}

/**
 * A visible top-level namespace, with the hidden siblings its module registered
 * beside it.
 */
export interface CommandNamespace extends CommandNode {
  /**
   * Sibling TOP-LEVEL commands the same module registered hidden. Absent from
   * every `--help`, which is why they are carried here rather than discovered.
   * Empty across the whole tree today.
   *
   * Empty when the module registers more than one VISIBLE namespace, because
   * arity alone cannot say which of them owns the hidden ones. Those cases are
   * reported by {@link unattributedHiddenSiblings} rather than guessed at.
   */
  readonly hiddenSiblings: readonly string[];
  readonly sourcePath: string;
  readonly registrar: string;
}

/**
 * Render a command's help exactly as a terminal would receive it.
 *
 * 🚨 `helpInformation()` IS NOT THIS. It stops at the options table and omits
 * every `addHelpText` block — the hand-written Notes and Examples, which are the
 * highest-value prose on the surface. Measured against commander 13 on `vibe`:
 * `helpInformation()` does not contain its `Subcommands:` epilogue and a capture
 * of `outputHelp()` does.
 *
 * The save/restore goes through the PUBLIC `configureOutput()`, but the saved
 * value must be a COPY. `configureOutput()` with no argument hands back the
 * live `_outputConfiguration` object and `configureOutput(x)` `Object.assign`s
 * into that same object — so keeping the reference and passing it back restores
 * nothing, because the reference already holds the overrides.
 *
 * EXPORTED for the byte-identity gate, which captures the real root program's
 * command at each documented path and compares. One copy of this save/restore
 * dance, deliberately: a second one in the test could restore differently and
 * make the two sides differ for a reason that has nothing to do with the tree.
 *
 * 🚨 A CAPTURE IS A FUNCTION OF THE TREE ALONE, AND THIS IS THE ONLY PLACE
 * THAT DECIDES IT. `helpScopeFooter` renders two facts that are true of the
 * running PROCESS rather than of the tree: the staleness notice, read from
 * `~/.nexus-mcp/version-check.json` at RENDER time, and the CLI version, read
 * from a `package.json` field the release writes on `main` and never on
 * `staging`. An unwrapped capture bakes both in. See {@link asDerivedCapture}
 * for the measurement behind each. Putting it here rather than at each call
 * site is the point: this function is the one funnel every derived capture goes
 * through — the docs model, the pages, and the gate that compares them — so
 * none of the three can drift from the others.
 */
export function captureHelp(command: Command): string {
  let buffer = "";
  const previous = { ...command.configureOutput() };
  command.configureOutput({
    writeOut: (text: string) => {
      buffer += text;
    },
    writeErr: () => {}
  });
  try {
    asDerivedCapture(() => command.outputHelp());
  } finally {
    command.configureOutput(previous);
  }
  return buffer.trimEnd();
}

function readOption(option: Option): CommandOption {
  const choices = optionChoices(option);
  return {
    flags: option.flags,
    description: option.description,
    ...(choices === undefined ? {} : { choices })
  };
}

/**
 * Every command the REAL root program registers, keyed by its space-joined path.
 *
 * ⚠️ THIS IS A HELP SOURCE, NEVER A POPULATION SOURCE. The tree is still the
 * union of the per-registrar walks, because only those can attribute a namespace
 * to the module that produced it. This map answers one question: for a path that
 * tree already found, WHICH live `Command` object does the shipped binary parse
 * with — so `--help` can be captured from that one instead of from a throwaway.
 *
 * 🚨 IT CAPTURES NO HELP. Building the index is a walk of `command.commands` and
 * nothing else, so it stays off the classification gate's bill; the capture
 * happens inside {@link CommandNode.help}'s getter, on the node that is asked.
 *
 * The import is DYNAMIC to route around a real cycle — `index.ts` imports the
 * registrars, the registrars reach this module, and this module now needs
 * `index.ts` back. `root-program.ts` is the sanctioned door and `index.ts`'s
 * side effect sits behind an entry-point guard, so importing it builds the tree
 * without running the CLI.
 *
 * Memoized: the tree is deterministic within a process, and four exported
 * functions each rebuild the module walks.
 */
let rootProgramIndex: Promise<ReadonlyMap<string, Command>> | undefined;

async function indexRootProgram(): Promise<ReadonlyMap<string, Command>> {
  const { buildRootProgram, VERSION } = await import("./root-program");
  const index = new Map<string, Command>();

  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = [...prefix, command.name()];
    index.set(path.join(" "), command);
    for (const child of command.commands) {
      if (child.name() !== "help") visit(child, path);
    }
  };

  for (const root of buildRootProgram(VERSION).commands) {
    if (root.name() !== "help") visit(root, []);
  }

  return index;
}

/**
 * THE ONE WALK. Everything else in this module is a projection of it.
 *
 * Depth-first over `command.commands`, never over rendered text: a rendering
 * omits hidden commands by construction, and it collapses a command's `.alias()`
 * spellings into the same row as its name.
 *
 * The walked `command` supplies every STRUCTURAL fact — path, options, children,
 * hiddenness. `rootProgram` supplies the rendered HELP, because that text is
 * decorated after every registrar has run. See {@link CommandNode.help}.
 */
function buildNode(
  command: Command,
  prefix: readonly string[],
  sourceModule: string,
  rootProgram: ReadonlyMap<string, Command>
): CommandNode {
  const path = [...prefix, command.name()];
  const children = command.commands
    .filter((child) => child.name() !== "help")
    .map((child) => buildNode(child, path, sourceModule, rootProgram));

  const live = rootProgram.get(path.join(" "));
  let cachedHelp: string | undefined;
  return {
    path: path.join(" "),
    name: command.name(),
    description: command.description(),
    aliases: command.aliases(),
    hidden: isHiddenCommand(command),
    options: command.options.map(readOption),
    children,
    isLeaf: children.length === 0,
    sourceModule,
    helpSource: live === undefined ? "registrar-fallback" : "root-program",
    get help(): string {
      cachedHelp ??= captureHelp(live ?? command);
      return cachedHelp;
    }
  };
}

/** A node and every descendant, depth-first, the node itself first. */
export function flattenCommands(node: CommandNode): CommandNode[] {
  return [node, ...node.children.flatMap(flattenCommands)];
}

/**
 * Every module, and every top-level command each one registers.
 *
 * ⚠️ THIS IS THE ATTRIBUTION SOURCE, NOT THE POPULATION SOURCE. Each registrar
 * runs against its OWN throwaway program, which is the only way to learn WHICH
 * module produced a namespace and which hidden siblings sit beside it. What it
 * cannot know is whether the real CLI calls that registrar at all — so the tree
 * itself is the union of these walks, and the spec beside this module asserts
 * separately that every registrar it finds is actually CALLED somewhere in
 * `src/` — a registrar defined in `src/commands/` and never wired would
 * otherwise contribute a command nobody can run.
 */
export async function deriveCommandModules(): Promise<CommandModule[]> {
  const modules: CommandModule[] = [];
  // Resolved ONCE, here, and threaded down. Every node's `help` getter closes
  // over it and stays lazy and synchronous.
  rootProgramIndex ??= indexRootProgram();
  const rootProgram = await rootProgramIndex;

  for (const registrar of await discoverRootRegistrars()) {
    const program = new Command();
    program.name("nexus").exitOverride();
    registrar.register(program);

    modules.push({
      sourceModule: registrar.module,
      sourcePath: registrar.sourcePath,
      registrar: registrar.name,
      roots: program.commands
        .filter((child) => child.name() !== "help")
        .map((child) => buildNode(child, [], registrar.module, rootProgram))
    });
  }

  return modules;
}

/**
 * THE AUTHORITATIVE TREE — the per-module walks, unioned.
 *
 * ⚠️ THE POPULATION IS NOT BUILT FROM `src/index.ts`, and the reason is
 * attribution rather than safety: only a registrar run against its own program
 * can say WHICH module produced a namespace and which hidden siblings sit beside
 * it. A shared program answers what exists and never who registered it. (The old
 * reason — that importing `index.ts` would parse `process.argv` — has stopped
 * being true: its side effect sits behind an entry-point guard, which is what
 * makes `root-program.ts` importable at all.)
 *
 * 🔴 THIS DOCBLOCK USED TO CERTIFY THE UNION "VERIFIED EQUAL TO A SINGLE SHARED
 * PROGRAM: 500 LEAVES EITHER WAY, EMPTY DIFF IN BOTH DIRECTIONS". That
 * measurement was true and it compared command PATHS — the one axis that never
 * diverged. Content was never compared, and it differed on 565 of 565 nodes:
 * `index.ts` decorates the
 * finished tree with the known-issues pointer and the help-scope footer, and no
 * throwaway program carries either. A certification that names its axis is worth
 * something; one that reads as "verified equal" stops the next reader looking.
 *
 * So the union still supplies the POPULATION and the attribution, and
 * {@link CommandNode.help} is captured from the real root program instead —
 * see {@link indexRootProgram}. `docs-help-matches-the-real-cli.test.ts` asserts
 * the two are byte-identical on every documented path, which is the check this
 * docblock only claimed to have run.
 *
 * 🚨 WHAT THE UNION STILL CANNOT REACH: the PROGRAM-LEVEL options. `--json`,
 * `--profile`, `--timeout` and `--dashboard-url` are applied to the root object
 * itself, so no namespace registrar can see them and neither does any node here
 * — the index above deliberately keys the root's CHILDREN, not the root. That is
 * a real gap with a real cost: a command-level `.option()` colliding with a
 * global never receives its value, because the root parses its own options
 * across the whole of argv first.
 */

/** Every node in the CLI, depth-first, sorted by path, de-duplicated. */
export async function deriveCommandNodes(): Promise<CommandNode[]> {
  const seen = new Map<string, CommandNode>();
  for (const module of await deriveCommandModules()) {
    for (const root of module.roots) {
      for (const node of flattenCommands(root)) {
        if (!seen.has(node.path)) seen.set(node.path, node);
      }
    }
  }
  return [...seen.values()].sort((left, right) => left.path.localeCompare(right.path));
}

/** The visible top-level namespaces, each carrying its attributed hidden siblings. */
export async function deriveCommandNamespaces(): Promise<CommandNamespace[]> {
  const namespaces: CommandNamespace[] = [];

  for (const module of await deriveCommandModules()) {
    const visible = module.roots.filter((root) => !root.hidden);
    const siblings = module.roots.filter((root) => root.hidden).map((root) => root.name);

    for (const root of visible) {
      // Field by field, never `{ ...root }`. Object spread READS every enumerable
      // property, so spreading would evaluate the `help` getter and capture help
      // for every namespace — making the laziness above a lie for exactly the
      // callers that never wanted the text.
      namespaces.push({
        path: root.path,
        name: root.name,
        description: root.description,
        aliases: root.aliases,
        hidden: root.hidden,
        options: root.options,
        children: root.children,
        isLeaf: root.isLeaf,
        sourceModule: root.sourceModule,
        helpSource: root.helpSource,
        get help(): string {
          return root.help;
        },
        hiddenSiblings: visible.length === 1 ? siblings : [],
        sourcePath: module.sourcePath,
        registrar: module.registrar
      });
    }
  }

  return namespaces.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Modules whose hidden siblings could not be attributed, because the module
 * registers more than one visible namespace. Reported, never guessed.
 */
export async function unattributedHiddenSiblings(): Promise<string[]> {
  const orphans: string[] = [];

  for (const module of await deriveCommandModules()) {
    const visible = module.roots.filter((root) => !root.hidden);
    const hidden = module.roots.filter((root) => root.hidden);
    if (hidden.length > 0 && visible.length !== 1) {
      orphans.push(`${module.sourceModule}: ${hidden.length} hidden, ${visible.length} visible`);
    }
  }

  return orphans;
}

/**
 * Every leaf path the CLI registers, sorted, de-duplicated.
 *
 * A PROJECTION of {@link deriveCommandNodes}, not a second walk. The
 * classification gate wants paths and nothing else; a docs generator wants the
 * metadata this throws away. Two walks over one tree is how the two answers
 * start disagreeing.
 */
export async function deriveCommandLeaves(): Promise<string[]> {
  return (await deriveCommandNodes()).filter((node) => node.isLeaf).map((node) => node.path);
}

/** Diff the derived tree against the declared classification. */
export async function classifyCommandUniverse(): Promise<DriftReport> {
  const observed = await deriveCommandLeaves();
  const observedSet = new Set(observed);

  return {
    observed,
    unclassified: observed.filter((path) => COMMAND_CLASSIFICATION[path] === undefined),
    stale: Object.keys(COMMAND_CLASSIFICATION)
      .filter((path) => !observedSet.has(path))
      .sort(),
    // `safe` is what the sweep RUNS, so both executable dispositions belong in
    // it. Filtering this to `"safe"` alone would silently stop sweeping every
    // fixture-backed leaf while `--check-drift` still reported them classified.
    safe: observed.filter(
      (path) =>
        COMMAND_CLASSIFICATION[path] === "safe" ||
        COMMAND_CLASSIFICATION[path] === "safe-with-fixture"
    ),
    fixtureBacked: observed.filter((path) => COMMAND_CLASSIFICATION[path] === "safe-with-fixture")
  };
}
