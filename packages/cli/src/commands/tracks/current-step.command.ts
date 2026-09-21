import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { TRACK_UPDATE_CURRENT_STEP_CONTRACT } from "../tracks.contract.generated";

const CURRENT_STEP_HELP = `
Examples:
  $ nexus tracks current-step 11111111-1111-4111-8111-111111111111 \\
      --text "waiting on the design review"
  $ nexus tracks current-step 11111111-1111-4111-8111-111111111111 --clear

Notes:
  EXACTLY ONE OF --text AND --clear. Neither is refused and both is refused,
  because an omitted --text meaning "clear it" is a footgun: a shell variable
  that expanded to nothing would silently wipe the line.
  THIS IS THE LINE "nexus tracks ready" PRINTS. It is what a person scanning
  the board reads first, and it is the only free-text field on the track that
  says what is happening rather than what the work IS.
  THE LINE IS AT MOST 400 CHARACTERS, and characters is the unit the database
  actually counts — the same limit "nexus tracks create --current-step" states.
  A WHITESPACE-ONLY LINE IS REFUSED. A line of only zero-width characters is not
  whitespace, so it is accepted and then renders as an empty line.
  THE LIMIT IS NOT CHECKED HERE. A longer line is refused by the server, so the
  number above is what you can rely on rather than what this command enforces.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist. That is deliberate — the two must not be distinguishable.
  Needs the "tracks:write" scope.`;

/** `nexus tracks current-step` */
export function registerTracksCurrentStepCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("current-step")
    .description("Set — or clear — what is happening on this track now")
    .argument("<trackId>", "The track to write the line on")
    .option("--text <text>", "The line, one sentence. What is happening right now")
    .option("--clear", "Clear the line instead of setting one")
    .addHelpText("after", CURRENT_STEP_HELP)
    .action(async (trackId: string, opts: { text?: string; clear?: boolean }) => {
      try {
        // Written as two named booleans rather than one clever comparison: this
        // guard is the only thing standing between a shell variable that
        // expanded to nothing and a silently wiped line.
        const clearing = opts.clear === true;
        const setting = opts.text !== undefined;
        if (clearing === setting) {
          process.exitCode = refuse("Pass exactly one of --text and --clear.");
          return;
        }

        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.updateCurrentStep(trackId, {
          currentStep: clearing ? null : (opts.text ?? null)
        });

        printSuccess(result.currentStep === null ? "Current step cleared." : "Current step set.", {
          trackId: result.trackId,
          currentStep: result.currentStep
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_UPDATE_CURRENT_STEP_CONTRACT);
  return leaf;
}
