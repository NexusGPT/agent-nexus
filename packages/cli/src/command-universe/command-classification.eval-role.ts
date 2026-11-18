/**
 * DECLARED DISPOSITIONS, `eval conv list` … `role workspace-grants`.
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

/** 73 leaves, `eval conv list` … `role workspace-grants`. */
export const EVAL_TO_ROLE: Readonly<Record<string, CommandDisposition>> = {
  // Golden-conversation authoring. `conv list` is a read with no required
  // input, but it is NOT `safe`: the namespace is whitelist-gated on
  // PROMPT_EVAL and the swept organization holds no opt-in, so the deployed
  // API answers the flag guard's generic 403 ("This feature is not enabled
  // for your organization") — a sentence `policy-refusal.sh` deliberately
  // does not match (broadening that list is the silent-and-permanent failure
  // its own header warns about). A `safe` row here would be a permanently
  // red sweep leaf, red for the flag working as designed. Every other verb
  // needs an id or mutates, and `conv new` is an interactive REPL that
  // creates a conversation the moment it starts.
  "eval conv list": "registration-only",
  "eval conv create": "registration-only",
  "eval conv get": "registration-only",
  "eval conv delete": "registration-only",
  "eval conv add-user": "registration-only",
  "eval conv generate": "registration-only",
  "eval conv accept": "registration-only",
  "eval conv set-golden": "registration-only",
  "eval conv checkpoint": "registration-only",
  "eval conv ready": "registration-only",
  "eval conv new": "never-execute",
  // Eval runs. `run list` is a read with no required input and is NOT `safe`,
  // for the same reason `conv list` above is not: the namespace is
  // whitelist-gated on PROMPT_EVAL, and the swept organization holds no
  // opt-in, so the deployed API answers the flag guard's generic 403 that
  // `policy-refusal.sh` deliberately does not match. Every other verb needs an
  // id or mutates — and `run create` is the one leaf in this CLI that would
  // spend real money on every sweep, because each cell runs the agent live
  // with its tools and then calls a judge.
  "eval run create": "registration-only",
  "eval run preview": "registration-only",
  "eval run list": "registration-only",
  "eval run get": "registration-only",
  "eval run abort": "registration-only",
  "eval run results": "registration-only",
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
  "role set-system-lifecycle": "registration-only",
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
  "role workspace-grants": "registration-only"
};
