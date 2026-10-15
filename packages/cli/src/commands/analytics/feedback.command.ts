import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { parseFeedbackScore } from "../../util/feedback-score";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  ANALYTICS_FEEDBACK__PARAMS_TIME_PERIOD,
  ANALYTICS_FEEDBACK_CONTRACT
} from "../analytics.contract.generated";
import { timePeriodOption } from "./_shared/time-period-option";

/** `nexus analytics feedback` */
export function registerAnalyticsFeedbackCommand(analytics: Command, program: Command): void {
  const feedback = addPaginationOptions(
    analytics
      .command("feedback")
      .description("List satisfaction feedback")
      .addOption(timePeriodOption(ANALYTICS_FEEDBACK__PARAMS_TIME_PERIOD))
      .option("--deployment-id <id>", "Filter by deployment")
      .option("--score <number>", "Filter by score — 0 to 1", parseFeedbackScore)
      .option("--search <keyword>", "Filter by keyword in the feedback comment")
  );

  feedback
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics feedback
  $ nexus analytics feedback --time-period 7d --score 1
  $ nexus analytics feedback --search "too long"
  $ nexus analytics feedback --limit 20 --json

Notes:
  --score IS A 0-TO-1 SCALE, NOT 1-5. The route validates it as a number in
  [0, 1] and this flag refuses anything outside that range before a request is
  built, naming the value it rejected. A fraction is legal on both sides:
  "--score 0.5" is sent as 0.5.

  THE meta HERE CARRIES FIVE FIELDS — total, page, limit, totalPages, paging.
  Every other list in this CLI carries three, so a parser written against
  tracing or conversation finds no totalPages here, and one written here finds
  none there.

  READ paging, NEVER total. total is PROBED, not counted: the server fetches
  limit+1 rows and reports offset+limit+1 whenever a next page exists. So on
  every page but the last, total means "one more than you have seen" and
  totalPages means "exactly one page left". Both are lower bounds, and only the
  final page reports the real figure.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.listFeedback({
          ...getPaginationParams(opts),
          timePeriod: opts.timePeriod,
          deploymentId: opts.deploymentId,
          score: opts.score,
          search: opts.search
        });

        const data = result.data ?? [];
        const meta = result.meta;

        printList(data, meta, [
          { key: "id", label: "ID", width: 36 },
          { key: "score", label: "SCORE", width: 6 },
          { key: "comment", label: "COMMENT", width: 40 },
          { key: "createdAt", label: "DATE", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose.
  bindCommand(feedback, ANALYTICS_FEEDBACK_CONTRACT);
}
