/**
 * DECLARED DISPOSITIONS, `skill-folder assign` … `tracing traces`.
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

/** 69 leaves, `skill-folder assign` … `tracing traces`. */
export const SKILL_FOLDER_TO_TRACING: Readonly<Record<string, CommandDisposition>> = {
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
  "template delete": "registration-only",
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
  "tracing traces": "safe"
};
