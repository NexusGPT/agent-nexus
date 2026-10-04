import type { SaveEmulatorScenarioBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { EMULATOR_SAVE_SCENARIO_CONTRACT } from "../../emulator.contract.generated";

/** `nexus emulator scenario save` */
export function registerEmulatorScenarioSaveCommand(scenario: Command, program: Command): Command {
  const leaf = scenario
    .command("save")
    .description("Save an emulator session's user messages as a replayable scenario")
    // --session-id, --deployment-id and --name are all REQUIRED by the route,
    // but each can arrive through --body instead, so none is a
    // Commander-required option — same reasoning as `deployment create`. The
    // API returns a clean validation error naming whichever is missing.
    .option("--session-id <id>", "Session ID (UUID) — required, here or in --body")
    .option("--deployment-id <id>", "Deployment ID (UUID) — required, here or in --body")
    .option("--name <name>", "Scenario name, 1-200 chars — required, here or in --body")
    .option("--description <text>", "Scenario description, up to 1000 chars")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario save --session-id 22222222-2222-4222-8222-222222222222 --deployment-id 55555555-5555-4555-8555-555555555555 --name "Happy path"
  $ nexus emulator scenario save --body '{"sessionId":"22222222-2222-4222-8222-222222222222","deploymentId":"55555555-5555-4555-8555-555555555555","name":"Edge case"}'

Notes:
  A SCENARIO IS THE USER'S SIDE ONLY — IT IS A SCRIPT, NOT A TRANSCRIPT. What
  is saved is the messages the participants sent, with the pauses between
  them; the agent's replies are not stored and are not part of what replay
  compares against. Replaying re-runs the agent from scratch.

  messageCount COUNTS PARTICIPANT MESSAGES, NOT TURNS. A session of one question
  and one agent reply saves as messageCount 1, which is correct and not a lost
  message. Replay's own advice is to compare counts, so compare this against the
  participant messages in the session, never against its total.

  --session-id, --deployment-id and --name are all required, by flag or inside
  --body. name is 1-200 characters, --description is capped at 1000, and both
  ids must be UUIDs.
  The session must belong to the deployment or it is a 403, and a session
  nobody has sent a message in is a 400 — send something first.
  Pauses between messages are recorded and capped at 30 seconds each, so a
  scenario saved over a long lunch replays quickly.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          sessionId: opts.sessionId,
          deploymentId: opts.deploymentId,
          name: opts.name,
          description: opts.description
        });

        const result = await client.emulator.saveScenario(
          asRequestBody<SaveEmulatorScenarioBody>(body)
        );
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, EMULATOR_SAVE_SCENARIO_CONTRACT);
  return leaf;
}
