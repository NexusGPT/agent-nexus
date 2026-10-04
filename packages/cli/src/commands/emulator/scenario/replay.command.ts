import type { ReplayEmulatorScenarioBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";

/** `nexus emulator scenario replay` — reaches a route the v1 contract does not declare. */
export function registerEmulatorScenarioReplayCommand(
  scenario: Command,
  program: Command
): Command {
  const leaf = scenario
    .command("replay")
    .description("Replay a scenario — ASYNCHRONOUS, the results are not in the response")
    .argument("<scenario-id>", "Scenario ID")
    .option(
      "--deployment-id <id>",
      "Deployment ID — required, and must be the one the scenario was recorded from"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario replay 11111111-1111-4111-8111-111111111111 --deployment-id 55555555-5555-4555-8555-555555555555
  $ nexus emulator scenario replay 11111111-1111-4111-8111-111111111111 --body '{"deploymentId":"55555555-5555-4555-8555-555555555555"}'
  $ nexus emulator scenario replay 11111111-1111-4111-8111-111111111111 --deployment-id 55555555-5555-4555-8555-555555555555 --json

Notes:
  REPLAY IS ASYNCHRONOUS AND THE RESPONSE CARRIES NO RESULTS. It answers as
  soon as it has created a session, before a single message has been sent —
  what the agent did is not in it and cannot be. Take the sessionId it returns
  and read "nexus emulator session get <deployment-id> <sessionId>" until the
  replies appear.

  IT CREATES A NEW SESSION EVERY TIME. Nothing is overwritten and nothing is
  compared: replay re-runs the agent live, so two replays of one scenario can
  differ, and neither is checked against what happened when it was recorded.
  Any assertion is yours to make on the session afterwards.

  --deployment-id MUST BE THE DEPLOYMENT THE SCENARIO WAS RECORDED FROM.
  Any other is a 403 — a scenario is not portable across deployments.
  Failures after the response are invisible here: the messages are sent in the
  background and a failed replay is logged server-side, leaving a session with
  fewer messages than the scenario has. Compare the counts.
  The real agent runs, with real tools and real cost, once per replay.`
    )
    .action(async (scenarioId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          deploymentId: opts.deploymentId
        });

        const result = await client.emulator.replayScenario(
          scenarioId,
          asRequestBody<ReplayEmulatorScenarioBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
