import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode } from "../../output";
import { CUE_TRANSCRIPTS_GET_TRANSCRIPT_CONTRACT } from "../cue.contract.generated";

/** `nexus cue transcript` */
export function registerCueTranscriptCommand(cue: Command, program: Command): void {
  const transcript = cue
    .command("transcript")
    .description("Print one conversation's full transcript as JSON")
    .argument("<id>", "Cue conversation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus cue transcript 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b > session.json
  $ nexus cue transcript 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b | jq '.counts'

Notes:
  THERE IS NO TABLE VIEW AND --json CHANGES NOTHING HERE. The whole point of
  this command is the raw document, so it always prints JSON — redirect it.
  A conversation belonging to another organization answers 404, not 403.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const document = await client.cueTranscripts.getTranscript(id);
        // Unindented under --json so a pipeline reads one compact object;
        // pretty otherwise, because a human ran this at a terminal.
        console.log(isJsonMode() ? JSON.stringify(document) : JSON.stringify(document, null, 2));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(transcript, CUE_TRANSCRIPTS_GET_TRANSCRIPT_CONTRACT);
}
