/**
 * DECLARED DISPOSITIONS, `upgrade` … `workspace unmount`.
 *
 * ONE SLICE of the single table `./command-classification.ts` assembles. DATA,
 * and nothing else: one `"<path>": "<disposition>"` line per leaf, held in the
 * order the table has always carried them, so which slice a leaf sits in is
 * invisible to every reader of `COMMAND_CLASSIFICATION`.
 *
 * WHAT BELONGS HERE: a leaf whose path falls inside the span above, with a
 * comment where its disposition is surprising. The promotion rules live on
 * `COMMAND_CLASSIFICATION` itself, so there is exactly one copy of them.
 *
 * WHAT DOES NOT: logic of any kind, and no second table —
 * `./sweep-expected-skips.ts` answers what one ENVIRONMENT does, which is a
 * different question from what may be done with a leaf.
 *
 * ⚠️ FILING A LEAF IN THE WRONG SLICE COSTS TIDINESS AND NOTHING ELSE, because
 * the assembler unions them. DECLARING ONE LEAF IN TWO SLICES THROWS, and that
 * refusal is what replaces the `ts(1117)` a single object literal used to get
 * from the compiler for free.
 */

import type { CommandDisposition } from "./disposition";

/** 64 leaves, `upgrade` … `workspace unmount`. */
export const UPGRADE_TO_WORKSPACE: Readonly<Record<string, CommandDisposition>> = {
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
  "workflow node webhook-secret": "registration-only",
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
  // Returns an AWS credential triplet on stdout — the shape the docblock above
  // refuses no matter how well it reads. Not `registration-only`: that
  // disposition admits a leaf with a required positional into the id-graph
  // ledger, and a `<mountId>` is not a route parameter anything can thread.
  "workspace credential-process": "never-execute",
  "workspace delete": "registration-only",
  "workspace history": "registration-only",
  "workspace list": "safe",
  "workspace mount": "never-execute", // mounts a FUSE drive on the caller's filesystem
  "workspace pull": "never-execute", // writes files into the caller's filesystem and runs its unzip
  "workspace push": "registration-only",
  "workspace remount": "never-execute", // mints and mounts a drive on the caller's filesystem
  "workspace rename": "registration-only",
  "workspace restore": "registration-only",
  "workspace revert": "registration-only",
  "workspace search": "registration-only",
  "workspace status": "registration-only",
  "workspace unmount": "never-execute" // unmounts a drive the caller may be using
};
