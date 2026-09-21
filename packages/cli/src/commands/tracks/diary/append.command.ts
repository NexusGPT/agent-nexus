import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  TRACK_APPEND_DIARY_ENTRY__BODY_KIND,
  TRACK_APPEND_DIARY_ENTRY_CONTRACT
} from "../../tracks.contract.generated";

const DIARY_APPEND_HELP = `
Examples:
  $ nexus tracks diary append 11111111-1111-4111-8111-111111111111 \\
      --kind PROGRESS --body-text "importer landed, 47 tasks created"
  $ nexus tracks diary append 11111111-1111-4111-8111-111111111111 \\
      --kind PROOF --body-text "suite green" \\
      --task 22222222-2222-4222-8222-222222222222 --artifact artifacts/suite.log

Notes:
  THIS IS THE ONLY WRITE THE LOG HAS. There is no update and no delete — not a
  guarded one, an absent one. Correct a wrong entry by appending a later one.
  THE AUTHOR IS THE CREDENTIAL, NEVER SOMETHING YOU PASS. A log whose author is
  caller supplied is a log anybody can write in somebody else's name.
  --body-text IS THE ENTRY, NOT A REQUEST BODY. This command takes no --body
  flag; every field has its own.
  --task, --agent AND --workspace ARE CHECKED. An id that does not resolve
  inside your organisation is a 404 and nothing is written.
  WHERE AN AGENT ID COMES FROM: "nexus tracks agent open" opens an agent on a
  track and prints its id, and "nexus tracks agent list" shows the ones already
  OPEN there. --agent here takes an ID ONLY and resolves no name, unlike
  "nexus tracks task claim". Neither verb is on this screen, because
  "nexus tracks agent" is a different parent from "nexus tracks diary".
  WHERE A TASK ID COMES FROM: "nexus tracks task list" prints one for every row
  of the plan.
  WHERE A WORKSPACE ID COMES FROM: "nexus workspace list". That is a different
  namespace entirely and nothing under "nexus tracks" mints one.
  Needs the "track_diary:write" scope.`;

/** `nexus tracks diary append` */
export function registerTracksDiaryAppendCommand(diary: Command, program: Command): Command {
  const leaf = diary
    .command("append")
    .description("Append one entry to the track's log")
    .argument("<trackId>", "The track to append to")
    .addOption(
      enumOption(
        "--kind <kind>",
        "What sort of entry this is",
        TRACK_APPEND_DIARY_ENTRY__BODY_KIND
      ).makeOptionMandatory()
    )
    .requiredOption("--body-text <text>", "The entry itself")
    .option("--task <taskId>", "The task this entry is about")
    .option("--agent <agentId>", "The agent this entry is about")
    .option("--workspace <workspaceId>", "The workspace the artifact lives in")
    .option("--artifact <path>", "Where the evidence for this entry is")
    .addHelpText("after", DIARY_APPEND_HELP)
    .action(
      async (
        trackId: string,
        opts: {
          kind: string;
          bodyText: string;
          task?: string;
          agent?: string;
          workspace?: string;
          artifact?: string;
        }
      ) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const entry = await client.tracks.appendDiaryEntry(trackId, {
            kind: opts.kind as never,
            body: opts.bodyText,
            taskId: opts.task ?? null,
            agentId: opts.agent ?? null,
            workspaceId: opts.workspace ?? null,
            artifactPath: opts.artifact ?? null
          });

          printSuccess("Entry appended.", { id: entry.id, kind: entry.kind });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(leaf, TRACK_APPEND_DIARY_ENTRY_CONTRACT);
  return leaf;
}
