/**
 * THE DECLARED TABLE — one line per leaf, saying what may be done with it.
 *
 * DATA, and nothing else. It is assembled here out of the
 * `command-classification.<span>.ts` slices beside this file, each holding a
 * contiguous run of the one sorted-by-namespace table in the order it has
 * always carried them. Which slice a leaf sits in is invisible to every reader
 * of {@link COMMAND_CLASSIFICATION}: the union is ONE record with ONE
 * denominator, which is what `classify.ts` needs — it diffs the derived tree
 * against a single table, so an unclassified leaf is a failure rather than a
 * default.
 *
 * 🚨 THE SLICES ARE A SIZE SPLIT AND NOT A SHARDING OF THE DENOMINATOR, and the
 * difference is the whole of why this is safe. Per-namespace TABLES would make a
 * leaf missing from whichever table nobody updated read as unclassified, and a
 * leaf declared twice read as classified twice. Neither survives here: there is
 * one table, and {@link assembleClassification} REFUSES a leaf two slices both
 * declare — which is what replaces the `ts(1117)` a single object literal got
 * from the compiler for free. Its header carries the measurement.
 *
 * WHAT BELONGS HERE: the promotion rules below, and the assembly. One leaf per
 * line goes in the slice whose span covers it — the spans are in the `@link`
 * list on the array, and filing one in the wrong slice costs tidiness and
 * nothing else.
 *
 * WHAT DOES NOT: logic of any kind, and no second table.
 * `sweep-expected-skips.ts` holds what one ENVIRONMENT answers, which is a
 * different question from what may be done with a leaf, and the docblock below
 * is emphatic about not merging them.
 */

import { ACCESS_CARD_TO_API } from "./command-classification.access-card-api";
import { APPS_TO_CHANNEL } from "./command-classification.apps-channel";
import { assembleClassification } from "./command-classification.assemble";
import { CHAT_TO_CUSTOM_MODEL } from "./command-classification.chat-custom-model";
import { CUSTOMER_TO_HTML_TEMPLATE } from "./command-classification.customer-html-template";
import { EVAL_TO_ROLE } from "./command-classification.eval-role";
import { KNOWN_ISSUES_TO_PROMPT } from "./command-classification.known-issues-prompt";
import { SKILL_FOLDER_TO_TRACING } from "./command-classification.skill-folder-tracing";
import { TRACKS_CORE } from "./command-classification.tracks-core";
import { TRACKS_TASK_AND_EVENTS } from "./command-classification.tracks-task-events";
import { UPGRADE_TO_WORKSPACE } from "./command-classification.upgrade-workspace";
import type { CommandDisposition } from "./disposition";

/**
 * WHAT MAY BE DONE WITH EACH LEAF. Declared, never derived.
 *
 * ⚠️ ADDING A LINE TO ONE OF THE SLICES BELOW IS PART OF ADDING A COMMAND, and
 * `command-universe.test.ts` is what makes that mandatory rather than polite.
 * A leaf missing from EVERY slice is unclassified and reds; a leaf in TWO is
 * refused by the assembler. Deleting a line is
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
 *     "feature is disabled" and "feature not enabled", and a feature-gated
 *     namespace answers "This feature is not enabled" — none of the three. So a
 *     leaf behind a gate the sweep organisation has not been granted lands as a
 *     FAIL rather than a SKIP. The remedy is to enable the feature for that
 *     organisation, never to broaden the grep: a wider grep turns a real outage
 *     into a SKIP everywhere.
 *   - AN EMPTY COLLECTION. It exercises auth, routing, tenancy scoping and the
 *     envelope, and it asserts nothing whatever about item shape. Six leaves
 *     already classified `safe` read empty against staging, so this is a REASON
 *     TO SEED A FIXTURE rather than a rule anything currently enforces.
 *
 * 🚨 AND ONE SHAPE IS REFUSED NO MATTER HOW WELL IT READS: a leaf that RETURNS
 * A CREDENTIAL. `apps git-credentials <projectId>` exits 0 and emits clean JSON
 * once given a project — it meets every test above — and what it emits is that
 * project's live git push token. `sweep.sh` prints the first 100 characters of a leaf's output
 * into the CI log on failure, and a CI log is readable by anyone with repository
 * access. It stays `registration-only` for that reason and not for any other, so
 * do not promote it on a later pass that only re-checks the input rules.
 */
export const COMMAND_CLASSIFICATION: Readonly<Record<string, CommandDisposition>> =
  assembleClassification([
    // `access-card available-actions` … `api` — 62 leaves
    { file: "command-classification.access-card-api.ts", entries: ACCESS_CARD_TO_API },
    // `apps approvals decide` … `channel whatsapp-template test-send` — 71 leaves
    { file: "command-classification.apps-channel.ts", entries: APPS_TO_CHANNEL },
    // `chat history` … `custom-model update` — 60 leaves
    { file: "command-classification.chat-custom-model.ts", entries: CHAT_TO_CUSTOM_MODEL },
    // `customer create` … `html-template update` — 84 leaves
    {
      file: "command-classification.customer-html-template.ts",
      entries: CUSTOMER_TO_HTML_TEMPLATE
    },
    // `known-issues` … `prompt graph` — 45 leaves
    { file: "command-classification.known-issues-prompt.ts", entries: KNOWN_ISSUES_TO_PROMPT },
    // `eval conv list` … `role workspace-grants` — 73 leaves
    { file: "command-classification.eval-role.ts", entries: EVAL_TO_ROLE },
    // `skill-folder assign` … `tracing traces` — 69 leaves
    { file: "command-classification.skill-folder-tracing.ts", entries: SKILL_FOLDER_TO_TRACING },
    // `tracks ready` … `tracks task edges` — 20 leaves
    { file: "command-classification.tracks-core.ts", entries: TRACKS_CORE },
    // `tracks task why-not-ready` … `tracks event append` — 14 leaves
    { file: "command-classification.tracks-task-events.ts", entries: TRACKS_TASK_AND_EVENTS },
    // `upgrade` … `workspace unmount` — 63 leaves
    { file: "command-classification.upgrade-workspace.ts", entries: UPGRADE_TO_WORKSPACE }
  ]);
