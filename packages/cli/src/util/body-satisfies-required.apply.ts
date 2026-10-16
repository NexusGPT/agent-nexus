import type { Command } from "commander";

import { resolveBody } from "./body";
import { scalarAsFlagValue } from "./body-satisfies-required.backfill";
import { resolveBodyField } from "./body-satisfies-required.field";
import { missingFieldMessage } from "./body-satisfies-required.message";
import { findDeferredRequirements } from "./body-satisfies-required.population";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * THE MECHANISM
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * For each matching command:
 *
 *  1. Every OTHER mandatory option is made non-mandatory
 *     (`Option.makeOptionMandatory(false)`), so commander's own early check
 *     stops firing. `mandatory` is read in exactly one place in commander —
 *     `_checkForMissingMandatoryOptions` — and never by the help renderer, so
 *     `--help` is unchanged by this.
 *  2. A `preAction` hook re-imposes the requirement at a point where `--body`
 *     has been read: a field is present if the FLAG carries a value OR the body
 *     carries the field's key.
 *  3. Where only the body carries it, the value is BACKFILLED into the option
 *     store, so `opts.<field>` reads the same thing it would have read from the
 *     flag.
 *
 * The check is therefore strictly WEAKER than commander's in one direction and
 * identical in the other: everything commander accepted is still accepted, and
 * a field supplied only through `--body` is now accepted too. Nothing that was
 * an error becomes silent.
 *
 * ── PRECEDENCE: THE FLAG WINS ────────────────────────────────────────────────
 *
 * When a field arrives through both paths, the explicit flag wins. That is not a
 * new decision — it is what `mergeBodyWithFlags` and `readStringField` have
 * always done, and what the root epilogue states under SENDING A BODY, whose
 * text is `root-help-epilogue.body.ts`. This seam does not touch merging; it
 * only decides whether the command is allowed to run. Choosing body-wins here
 * would have contradicted the merge milliseconds later, the worst of both.
 *
 * ── STDIN IS READ ONCE ───────────────────────────────────────────────────────
 *
 * This resolves `--body` and so does the action, and `--body -` can only be read
 * once. `resolveRequiredBody` memoizes on the raw flag value for exactly that
 * reason; its own docblock owns the argument. Without it, `--body -` would hang
 * forever rather than fail.
 */

/**
 * Rewire every command in the tree whose required flags can be satisfied from
 * its JSON body. Call ONCE from `root-tree-decorations.ts`, after registration.
 */
export function applyBodySatisfiesRequired(root: Command): void {
  for (const { command, bodyFlag, options } of findDeferredRequirements(root)) {
    // Resolve every key HERE, while the tree is being built, so a contradiction
    // between the declared and contract channels throws before any parse rather
    // than inside a pre-action hook on one unlucky invocation.
    const deferred = options.map((option) => ({
      option,
      attribute: option.attributeName(),
      ...resolveBodyField(option)
    }));

    for (const { option } of deferred) option.makeOptionMandatory(false);

    const bodyAttribute = bodyFlag.replace(/^--/, "");

    command.hook("preAction", async (_thisCommand, actionCommand) => {
      const opts = actionCommand.opts();
      const rawBody: unknown = opts[bodyAttribute];
      const body = typeof rawBody === "string" ? await resolveBody(rawBody) : undefined;

      for (const { option, attribute, field } of deferred) {
        if (opts[attribute] !== undefined) continue; // the flag wins, always

        // `field` is the BODY key, `attribute` is where the ACTION reads it.
        // They differ whenever a flag is named away from the field it fills, and
        // conflating them is what refused a correct body.
        const fromBody = body?.[field];
        if (fromBody === undefined) {
          actionCommand.error(missingFieldMessage(option, bodyFlag, field), {
            code: "commander.missingMandatoryOptionValue"
          });
          return;
        }
        const backfill = scalarAsFlagValue(fromBody);
        if (backfill !== undefined) actionCommand.setOptionValue(attribute, backfill);
      }
    });
  }
}
