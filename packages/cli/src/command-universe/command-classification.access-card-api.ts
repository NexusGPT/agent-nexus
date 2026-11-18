/**
 * DECLARED DISPOSITIONS, `access-card available-actions` … `api`.
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

/** 62 leaves, `access-card available-actions` … `api`. */
export const ACCESS_CARD_TO_API: Readonly<Record<string, CommandDisposition>> = {
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
  "admin vibe-tenant-cluster complete-teardown": "registration-only",
  "admin vibe-tenant-cluster disable": "registration-only",
  "admin vibe-tenant-cluster force-converge": "registration-only",
  "admin vibe-tenant-cluster provision": "registration-only",
  "admin vibe-tenant-cluster request-server-roll": "registration-only",

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
  api: "never-execute" // accepts any HTTP verb against any path — unbounded by construction
};
