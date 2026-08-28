import { Command, Option } from "commander";

import { createClient } from "../client";
import {
  bindCommand,
  type ContractEnum,
  enumArgument,
  enumInCompositeOption,
  enumOption
} from "../contract-binding";
import { handleError, reportFailure } from "../errors";
import { printEnvelope, printList, printRecord } from "../output";
import { parseFeedbackScore } from "../util/feedback-score";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { parseTimePeriod, TIME_PERIOD_HELP, TIME_PERIOD_SHORTHANDS } from "../util/time-period";
import {
  ANALYTICS_EXPORT__PARAMS_TIME_PERIOD,
  ANALYTICS_EXPORT_CONTRACT,
  ANALYTICS_FEEDBACK__PARAMS_TIME_PERIOD,
  ANALYTICS_FEEDBACK_CONTRACT,
  ANALYTICS_OVERVIEW__PARAMS_TIME_PERIOD,
  ANALYTICS_OVERVIEW_CONTRACT,
  ANALYTICS_QUERY_CONTRACT,
  ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP,
  ANALYTICS_QUERY_STRUCTURED__BODY_GRANULARITY,
  ANALYTICS_QUERY_STRUCTURED__BODY_ORDER,
  ANALYTICS_QUERY_STRUCTURED__BODY_PERIOD,
  ANALYTICS_QUERY_STRUCTURED__BODY_VIEW,
  ANALYTICS_QUERY_STRUCTURED_CONTRACT
} from "./analytics.contract.generated";

/**
 * A comma list folded to the width of the prose around it.
 *
 * `addHelpText` output is emitted VERBATIM — commander re-wraps the generated
 * usage and options and never the blocks this file writes — so an interpolated
 * value is the one thing in a hand-wrapped paragraph whose length nobody
 * controls. The eight physical view names on one line rendered a 220-column
 * row inside a block wrapped at 78, and a ninth view would have pushed it
 * further with nothing going red. Folding keeps the width a property of the
 * data rather than of a line break somebody typed once.
 */
function foldList(items: readonly string[], width: number, indent: string): string {
  const lines: string[] = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last}, ${item}`.length + indent.length <= width) {
      lines[lines.length - 1] = `${last}, ${item}`;
    } else {
      lines.push(item);
    }
  }
  return lines.join(`,\n${indent}`);
}

/**
 * The curated views, from the contract rather than retyped.
 *
 * This list used to be eight string literals with a comment asking whoever
 * edited `ANALYTICS_VIEW_NAMES` to remember this file — "the CLI ships
 * standalone, so it can't import it". It can't import it at RUNTIME; it can
 * generate from it at build time, which is what
 * `analytics.contract.generated.ts` is. `contract-help.test.ts` fails if the
 * generated copy stops matching the schema.
 *
 * `query` (raw SQL) addresses the PHYSICAL view, `metrics` (structured) the
 * public one, and both derive from this single array so they cannot disagree
 * about which views exist.
 */
const ANALYTICS_PUBLIC_VIEWS = foldList(
  ANALYTICS_QUERY_STRUCTURED__BODY_VIEW.contractValues,
  76,
  "  "
);
const ANALYTICS_PHYSICAL_VIEWS = foldList(
  ANALYTICS_QUERY_STRUCTURED__BODY_VIEW.contractValues.map((view) => `analytics_${view}`),
  76,
  "    "
);

/**
 * `--time-period`, bound to whichever descriptor's copy of the enum applies.
 *
 * The CLI accepts MORE than the contract here and always has: `30d` and friends
 * were the documented spelling in older help text, and NEX-2367 kept them
 * working rather than 400ing a command somebody had in a script. That is a
 * declared WIDENING — the shorthands are offered as choices and normalised to
 * the canonical value before the request leaves, so the flag is still validated
 * locally and the server still only ever sees an enum member.
 */
function timePeriodOption(source: ContractEnum): Option {
  return enumOption(
    "--time-period <period>",
    TIME_PERIOD_HELP,
    source,
    {
      alsoAccepts: TIME_PERIOD_SHORTHANDS,
      because: "shorthands are normalised to the canonical value before sending"
    },
    parseTimePeriod
  );
}

export function registerAnalyticsCommands(program: Command): void {
  const analytics = program.command("analytics").description("View analytics and metrics");

  analytics.addHelpText(
    "after",
    `
THREE READ SURFACES OVER ONE DATASET, AND ONLY ONE TAKES A QUESTION YOU WROTE.
"overview" is a fixed KPI bundle — you choose --time-period and --deployment-id
and nothing else. "metrics" is a structured aggregation over eight curated views
named plainly:
  ${ANALYTICS_PUBLIC_VIEWS}.
"query" is read-only SQL over the SAME eight, each named analytics_<view>.

REACH FOR "metrics" FIRST. It checks your columns against the view's own catalog
and refuses a wrong one BY NAME, where a mistyped column in raw SQL comes back
as a database error. Drop to "query" only for what the structured form cannot
express — a join, a window function, a min()/max() over the window.

"feedback" and "export" are separate reads and share neither surface: they take
no view, no metric and no group-by.`
  );

  // ── overview ──────────────────────────────────────────────────────────
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

  // ── feedback ──────────────────────────────────────────────────────────
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

  THE meta HERE CARRIES FIVE FIELDS — total, page, limit, totalPages, hasMore.
  Every other list in this CLI carries three, so a parser written against
  tracing or conversation finds no totalPages here, and one written here finds
  none there.

  READ hasMore, NEVER total. total is PROBED, not counted: the server fetches
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

  // ── export ────────────────────────────────────────────────────────────
  const exportCsv = analytics
    .command("export")
    .description("Export analytics as CSV")
    .addOption(timePeriodOption(ANALYTICS_EXPORT__PARAMS_TIME_PERIOD))
    .option("--deployment-id <id>", "Filter by deployment");

  exportCsv
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics export
  $ nexus analytics export --time-period 30d > analytics.csv
  $ nexus analytics export --deployment-id 11111111-1111-4111-8111-111111111111

Notes:
  Outputs CSV to stdout. Redirect to file: nexus analytics export > report.csv

  IT IS NOT ONE ROW PER CONVERSATION. The header is
  Section,Metric,Value,CreatedAt,ChatId and the file is three stacked blocks
  keyed by Section, always in this order:
    Summary     five rows — Time Period, Total Conversations, Total Messages,
                Total Cost (USD), Total Unique Users.
    Deployment  one row per deployment; Metric is its name and Value is its
                CONVERSATION count, nothing else.
    Message     one row per message; Metric is the message type and Value is
                the content TRUNCATED TO 200 CHARACTERS.
  CreatedAt and ChatId are EMPTY on every Summary and Deployment row. Filter on
  Section before you read Value as a number, or the Message block poisons the
  column.

  PER-MODEL AND PER-SOURCE COST ARE COMPUTED AND NEVER WRITTEN. The export
  builds both breakdowns and emits neither, so no --flag here reaches them —
  use "nexus tracing cost-breakdown" for spend by model.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.analytics.exportCsv({
          timePeriod: opts.timePeriod,
          deploymentId: opts.deploymentId
        });

        // CSV data — output directly for piping
        if (typeof result === "string") {
          console.log(result);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── query ─────────────────────────────────────────────────────────────
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
          // The request COMPLETED. The server ran the query and reported that it
          // failed, which is not the caller mistyping a flag.
          process.exitCode = reportFailure(
            "remote-error",
            `Query error: ${result.error}`,
            "The SQL is run against the curated analytics views; check the table and column names."
          );
          return;
        }

        const columns = result.fields.map((f) => ({ key: f.name, label: f.name, width: 28 }));
        // `truncated` says the answer is PARTIAL, and until NEX-4139 only the
        // terminal was ever told: a script read a short result as a complete
        // one. The whole response is the document now, and the row count, the
        // elapsed time and the truncation flag ride with it.
        printEnvelope(result, () => {
          printList(result.rows, undefined, columns);
          const note = result.truncated ? " (truncated)" : "";
          process.stderr.write(
            `\n${result.rowCount} row(s) in ${result.executionTimeMs}ms${note}\n`
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── metrics (structured, non-SQL) ─────────────────────────────────────────
  // `<view>` IS validated, exactly like the flags beside it. Commander checks
  // `.choices()` on a positional as readily as on an option — measured by
  // driving a junk value through a real program, not by reading `Argument`.
  const metrics = analytics
    .command("metrics")
    .description("Run a structured (non-SQL) query over a curated analytics view")
    .addArgument(
      enumArgument(
        "<view>",
        "Curated analytics view to query",
        ANALYTICS_QUERY_STRUCTURED__BODY_VIEW
      )
    )
    .option("-m, --metric <metric...>", 'metric(s): "count" or "<agg>:<column>" (sum|avg|min|max)')
    .option("-g, --group-by <dimension...>", "dimension(s) to group by")
    .addOption(
      enumInCompositeOption(
        "-f, --filter <expr...>",
        'filter(s) as "field:op:value"',
        ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP,
        "op"
      )
    )
    .addOption(
      enumOption(
        "--granularity <granularity>",
        "time bucket",
        ANALYTICS_QUERY_STRUCTURED__BODY_GRANULARITY
      )
    )
    .addOption(
      enumOption(
        "-p, --period <period>",
        "time period (default last_30_days)",
        ANALYTICS_QUERY_STRUCTURED__BODY_PERIOD
      )
    )
    .option("--order-by <alias>", "metric alias, groupBy field, or 'bucket'")
    .addOption(
      enumOption("--order <order>", "sort direction", ANALYTICS_QUERY_STRUCTURED__BODY_ORDER)
    )
    .option("--limit <n>", "max rows", (v) => parseInt(v, 10))
    .option("--show-sql", "print the generated SQL to stderr");

  metrics
    .addHelpText(
      "after",
      `
Examples:
  $ nexus analytics metrics conversations -m count -g agentId --period last_7_days
  $ nexus analytics metrics node_runs -m count -g nodeType -f status:eq:ERROR --json
  $ nexus analytics metrics generations -m sum:costUsd -g modelName --granularity day --order-by bucket

Views:
  ${ANALYTICS_PUBLIC_VIEWS}.

Notes:
  NOTHING HERE LISTS A VIEW'S COLUMNS, SO THE FIRST -m/-g IS A GUESS. Two ways
  to stop guessing. Run "nexus analytics query 'SELECT * FROM analytics_traces
  LIMIT 1' --json" — the response's "fields" array names every column of that
  view. Or pass --show-sql on any working call: the compiled statement names the
  physical table and each column it selected.

  --show-sql GOES TO STDERR, NOT STDOUT. So "--show-sql --json > out.json"
  leaves the SQL on your terminal and out.json a pure document. Redirect stderr
  (2>sql.txt) when you want to keep it.

  A WRONG COLUMN IS REFUSED BY NAME AND THE REFUSAL LISTS NOTHING. You get
  "<x> is not a dimension on view <v>" for -g, "<x> is not a measure on view
  <v>" for -m, or "<x> is not a column on view <v>" for a -f field — never the
  accepted set. Read it out of the view with the SELECT above.

  THE SAME EIGHT VIEWS ANSWER TO "analytics query" AS analytics_<view>. This
  command takes traces; that one takes analytics_traces, and each refuses the
  other's spelling.`
    )
    .action(
      async (
        view: string,
        opts: {
          metric?: string[];
          groupBy?: string[];
          filter?: string[];
          granularity?: string;
          period?: string;
          orderBy?: string;
          order?: string;
          limit?: number;
          showSql?: boolean;
        }
      ) => {
        try {
          const filters = (opts.filter ?? []).map((raw) => {
            const idx1 = raw.indexOf(":");
            const idx2 = raw.indexOf(":", idx1 + 1);
            if (idx1 === -1 || idx2 === -1) {
              throw new Error(`Invalid filter "${raw}". Use "field:op:value".`);
            }
            const op = raw.slice(idx1 + 1, idx2);
            const rawValue = raw.slice(idx2 + 1);
            return {
              field: raw.slice(0, idx1),
              op,
              value: op === "in" ? rawValue.split(",") : rawValue
            } as {
              field: string;
              op: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte";
              value: string | string[];
            };
          });

          const client = createClient(program.optsWithGlobals());
          const result = await client.analytics.queryStructured({
            view,
            metrics: opts.metric ?? ["count"],
            groupBy: opts.groupBy,
            filters,
            granularity: opts.granularity as "hour" | "day" | "week" | "month" | undefined,
            period: opts.period,
            orderBy: opts.orderBy,
            order: opts.order as "asc" | "desc" | undefined,
            limit: opts.limit
          });

          if (result.error) {
            process.exitCode = reportFailure(
              "remote-error",
              `Query error: ${result.error}`,
              "The SQL is run against the curated analytics views; check the table and column names."
            );
            return;
          }

          if (opts.showSql) process.stderr.write(`SQL: ${result.generatedSql}\n`);

          const columns = result.fields.map((f) => ({ key: f.name, label: f.name, width: 28 }));
          // Same envelope as `analytics query` above, and for the same reason:
          // `truncated` is the field that separates a partial answer from a
          // complete one, and a `--json` caller could not see it.
          printEnvelope(result, () => {
            printList(result.rows, undefined, columns);
            const note = result.truncated ? " (truncated)" : "";
            process.stderr.write(
              `\n${result.rowCount} row(s) in ${result.executionTimeMs}ms${note}\n`
            );
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // Bound LAST, after every option exists and after the hand-written prose.
  // `bindCommand` reads the command's own options to find the divergences it
  // must render, so an option added afterwards would be invisible to the block
  // it already composed. Appending here also puts the generated reference BELOW
  // the Examples and Notes, which are the half carrying meaning a schema cannot.
  // `contract-help.test.ts` asserts that ordering rather than trusting it.
  bindCommand(overview, ANALYTICS_OVERVIEW_CONTRACT);
  bindCommand(feedback, ANALYTICS_FEEDBACK_CONTRACT);
  bindCommand(exportCsv, ANALYTICS_EXPORT_CONTRACT);
  bindCommand(query, ANALYTICS_QUERY_CONTRACT);
  // `Body.view` needs no `bodyOnly` exemption: it is bound to the `<view>`
  // positional above, which commander validates. The exemption that used to sit
  // here claimed positionals could not carry `.choices()`, which is false.
  bindCommand(metrics, ANALYTICS_QUERY_STRUCTURED_CONTRACT);
}
