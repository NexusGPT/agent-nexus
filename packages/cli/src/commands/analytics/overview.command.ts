import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import {
  ANALYTICS_OVERVIEW__PARAMS_TIME_PERIOD,
  ANALYTICS_OVERVIEW_CONTRACT
} from "../analytics.contract.generated";
import { timePeriodOption } from "./_shared/time-period-option";

/** `nexus analytics overview` */
export function registerAnalyticsOverviewCommand(analytics: Command, program: Command): void {
  const overview = analytics
    .command("overview")
    .description("Get analytics overview")
    .addOption(timePeriodOption(ANALYTICS_OVERVIEW__PARAMS_TIME_PERIOD))
    .option("--deployment-id <id>", "Filter by deployment ID");

  overview
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics overview
  $ nexus analytics overview --time-period last_30_days
  $ nexus analytics overview --deployment-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  EIGHT SCALARS AND FIVE NESTED FIELDS. The scalars are totalConversations,
  totalMessages, totalUniqueUsers and totalCostUsd, each with a *Change beside
  it. EVERY *Change IS A PERCENTAGE against the immediately preceding window of
  the same length, never an absolute delta.

  tokenUsage IS AN OBJECT {inputTokens, outputTokens}. timeSeries IS AN OBJECT
  of four arrays — conversationsPerDay, messagesPerDay, usersPerDay, costPerDay
  — each element {date, value}. byChannel, byDeployment and byModel ARE ARRAYS
  of {entityId, label, value}.

  THE TABLE RENDERS EACH OF THOSE FIVE AS ONE JSON CELL, so read them with
  --json. Only byDeployment resolves a real name into label; on byChannel and
  byModel label REPEATS entityId, so there is no second name to read there.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.getOverview({
          timePeriod: opts.timePeriod,
          deploymentId: opts.deploymentId
        });
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose.
  // `bindCommand` reads the command's own options to find the divergences it
  // must render, so an option added afterwards would be invisible to the block
  // it already composed. Appending here also puts the generated reference BELOW
  // the Examples and Notes, which are the half carrying meaning a schema cannot.
  // `contract-help.test.ts` asserts that ordering rather than trusting it.
  bindCommand(overview, ANALYTICS_OVERVIEW_CONTRACT);
}
