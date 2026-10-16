import type { Command, Option } from "commander";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ONE SEAM AND NOT A LIST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The same defect was shipped independently on every affected command, which is
 * the signature of a rule that lives in nobody's code. A hand-maintained list of
 * participating commands would be that same defect one level up: it goes stale
 * in silence, and the next command to declare `--body` beside a `requiredOption`
 * inherits the bug with nothing to notice it.
 *
 * So the POPULATION IS DERIVED. This walks the real commander tree once, after
 * every command is registered, and rewires every command whose SHAPE matches —
 * a JSON body flag plus at least one other mandatory option. A command written
 * next month participates without its author knowing this file exists.
 */

/**
 * Which flags carry a JSON request body.
 *
 * `--body` on most commands, `--data` on five of them across three namespaces —
 * `ticket create/update`, `credential update` and `access-card create/update`.
 * The root epilogue names that set, and `request-body-flag-spelling.test.ts`
 * derives it from this tree so the two cannot drift.
 *
 * NEITHER NAME IS SUFFICIENT ON ITS OWN, WHICH IS WHY THE PLACEHOLDER IS TESTED
 * TOO. It is what discriminates a JSON body from a same-named prose field:
 * `ticket comment --body <text-or-->` is a comment's TEXT and must keep
 * commander's early check, and `html-template render --data <json>` is a
 * render input rather than a request body — the second is caught by the shape
 * rule below (it declares no other mandatory option), not by this predicate.
 */
function findJsonBodyOption(command: Command): Option | undefined {
  return command.options.find(
    (option) => (option.long === "--body" || option.long === "--data") && /<json/.test(option.flags)
  );
}

/**
 * Every command in the tree, root included, depth first.
 */
function everyCommand(root: Command): Command[] {
  const out: Command[] = [root];
  for (const child of root.commands) out.push(...everyCommand(child));
  return out;
}

/**
 * A command whose required flags may instead be supplied inside its JSON body,
 * and the options that applies to.
 *
 * Exported so the test can derive the same population from the same rule rather
 * than restating it — a test carrying its own copy of the predicate proves the
 * copy, not the code.
 */
export interface DeferredRequirement {
  command: Command;
  bodyFlag: string;
  options: Option[];
}

export function findDeferredRequirements(root: Command): DeferredRequirement[] {
  const out: DeferredRequirement[] = [];
  for (const command of everyCommand(root)) {
    const bodyOption = findJsonBodyOption(command);
    if (!bodyOption) continue;
    const options = command.options.filter((option) => option.mandatory && option !== bodyOption);
    if (options.length === 0) continue;
    out.push({ command, bodyFlag: bodyOption.long as string, options });
  }
  return out;
}
