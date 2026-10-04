import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus deployment stats` */
export function registerDeploymentStatsCommand(deployment: Command, program: Command): void {
  deployment
    .command("stats")
    .description("Get deployment statistics")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment stats 11111111-1111-4111-8111-111111111111
  $ nexus deployment stats 11111111-1111-4111-8111-111111111111 --json

Notes:
  totalSessions AND totalMessages ARE CAPPED AT THE NEWEST 500 SESSIONS. They
  are computed from the returned page, not queried, so a busier deployment
  reports exactly 500 sessions and stops growing. Nothing marks the cut.
  EMULATOR SESSIONS ARE NOT COUNTED, in either term. Testing a deployment
  through "nexus emulator" leaves these figures untouched — they are what real
  customers did. Use "nexus emulator session list" to see test traffic. There is
  no date range and no filter here; use "nexus analytics" for anything
  time-bounded or cross-deployment.

  THE RESPONSE CARRIES A THIRD KEY THE TWO COUNTERS ARE COMPUTED FROM:
  sessions, an array of {id, chatId, messageCount, updatedAt, createdAt},
  newest first. totalSessions is that array's LENGTH and totalMessages is the
  sum of its messageCount fields, so the 500 cut above is checkable rather
  than taken on trust — count the array. chatId is the "nexus conversation"
  id for that session, or null where the session produced no chat.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const stats = await client.deployments.getStatistics(id);
        printRecord(stats);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
