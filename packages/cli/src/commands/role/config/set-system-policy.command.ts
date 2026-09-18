import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "../../role-coverage-copy";
import { type RoleSetSystemPolicyOptions, setRoleSystemPolicy } from "./set-system-policy.handler";

/** `nexus role set-system-policy` */
export function registerRoleSetSystemPolicyCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-system-policy")
    .description("Replace a Role's system policy")
    .argument("<role>", "Role name or UUID")
    .option("--allow-proposals <bool>", "true or false")
    .option("--require-review <bool>", "true or false")
    .option("--start-paused <bool>", "true or false")
    .option("--auto-push <bool>", "true or false")
    .option("--notify-takeover <bool>", "true or false")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-system-policy "Support" --allow-proposals true \\
      --require-review true --start-paused true --auto-push false \\
      --notify-takeover true

Notes:
  ALL FIVE ARE REQUIRED — this replaces the whole policy, so an omitted flag is
  a 400 rather than "leave it alone".
  A value that is not exactly "true" or "false" is refused rather than read as
  false, because a typo that silently disables a review gate is the worst
  outcome available here.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts: RoleSetSystemPolicyOptions) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const policy = await setRoleSystemPolicy(client, ref, opts);

        printSuccess("System policy updated.", {
          allowProposals: policy.allowProposals,
          requireReview: policy.requireReview,
          startPaused: policy.startPaused,
          autoPush: policy.autoPush,
          notifyTakeover: policy.notifyTakeover
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
