import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { ANALYTICS_QUERY_CONTRACT } from "../analytics.contract.generated";
import { ANALYTICS_PHYSICAL_VIEWS } from "./_shared/fold-list";
import { printQueryResult, reportQueryError } from "./_shared/print-query-result";

/** `nexus analytics query <sql>` */
export function registerAnalyticsQueryCommand(analytics: Command, program: Command): void {
  const query = analytics
    .command("query <sql>")
    .description("Run a read-only SQL query over the curated analytics views");

  query
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics query 'SELECT count(*) AS n FROM analytics_traces'
  $ nexus analytics query 'SELECT "modelName", SUM("costUsd") AS spend FROM analytics_generations GROUP BY 1 ORDER BY spend DESC' --json

Notes:
  Read-only, single statement, org-scoped. Views:
    ${ANALYTICS_PHYSICAL_VIEWS}.

  THESE ARE THE SAME EIGHT VIEWS "analytics metrics" TAKES, UNDER THE PHYSICAL
  NAME. metrics takes traces, query takes analytics_traces, and each refuses the
  other's spelling. Run the structured form with --show-sql: the statement it
  prints runs verbatim here, which is the shortest path from a structured query
  to a custom one.`
    )
    .action(async (sql: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.query({ query: sql });

        if (result.error) {
          reportQueryError(result.error);
          return;
        }

        printQueryResult(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose.
  bindCommand(query, ANALYTICS_QUERY_CONTRACT);
}
