import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { color, isJsonMode, printList, printRecord, printSuccess } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  TRACING_ANALYTICS_TIMELINE__PARAMS_GRANULARITY,
  TRACING_ANALYTICS_TIMELINE_CONTRACT,
  TRACING_EXPORT_BULK__BODY_FORMAT,
  TRACING_EXPORT_BULK__BODY_STATUS,
  TRACING_EXPORT_BULK_CONTRACT,
  TRACING_EXPORT_TRACE__BODY_FORMAT,
  TRACING_EXPORT_TRACE_CONTRACT
} from "./tracing.contract.generated";

export function registerTracingCommands(program: Command): void {
  const tracing = program
    .command("tracing")
    .description("View LLM traces and analytics — a 7-day window, not an audit log");

  tracing.addHelpText(
    "after",
    `
TRACES EXPIRE. Retention is 7 days by default and can never be set BELOW 7 —
a shorter value is refused and falls back to 7. It is a server-side setting
with no public-API control, so treat anything older than a week as gone:
"tracing export" / "export-bulk" while it is still there, or lose it.

A TRACE IS A RUN, A GENERATION IS ONE MODEL CALL. One trace holds many
generations, and cost/tokens on the trace are the sum over its generations.

WHERE THE COST FIELDS ARE: totalCostUsd on a trace, costUsd on a generation,
both plain USD. The legacy costInUSDTenThousandths is NOT part of this API's
responses — code still reading it gets undefined, not a number.

WHAT IS ONLY IN ONE PLACE: the system prompt, the messages and the response
text come back from "tracing generation <id>" and from nowhere else — and
even there only under --json, because the table view prints metadata only.

Deleting is real: "tracing delete" removes the trace AND its generations, and
nothing else in the platform keeps a copy.

THIS NAMESPACE READS ROWS; "nexus analytics" AGGREGATES THE SAME DATA. Every
command here answers "what did this run do", one trace or one generation at a
time, and the only shaping on offer is the fixed grouping of cost-breakdown. A
cross-cutting question — an arbitrary group-by, a join, the earliest startedAt
still retained — is not expressible here and is a one-liner over the
analytics_traces and analytics_generations views:

  $ nexus analytics query "SELECT min(startedAt) FROM analytics_traces"

Same window, same data. Use that to establish what retention actually leaves
you before concluding a trace is missing.`
  );

  // ── traces ────────────────────────────────────────────────────────────
  addPaginationOptions(
    tracing
      .command("traces")
      .description("List LLM traces")
      .option("--status <status>", "Filter by status (IN_PROGRESS, COMPLETED, FAILED)")
      .option("--agent-id <id>", "Filter by agent ID")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .option("--model <name>", "Filter by model name (max 255 chars)")
      .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
      .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
      .option(
        "--sort-by <field>",
        "Sort by field (startedAt, totalCostUsd, totalDurationMs)",
        "startedAt"
      )
      .option("--order <dir>", "Sort order (asc, desc)", "desc")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus tracing traces
  $ nexus tracing traces --status FAILED --limit 10
  $ nexus tracing traces --agent-id abc --start-date 2026-03-01 --json

Notes:
  NOTHING OLDER THAN THE RETENTION WINDOW IS HERE. An empty result for last
  month is expiry, not "it never ran" — see "nexus tracing --help".
  COST IS totalCostUsd, IN DOLLARS. A "-" in the COST column is null (the run
  is still in progress, or no priced generation was recorded) and is NOT zero.
  Same for DURATION.
  --start-date / --end-date are ISO 8601 and filter on when the trace STARTED,
  so a run that began before the window and finished inside it is excluded.
  --agent-id and --workflow-id match the trace's recorded context. A trace with
  no context — a bare API call — matches neither and is only reachable
  unfiltered.
  --sort-by takes startedAt, totalCostUsd or totalDurationMs, and nothing else;
  any other value is refused.
  --model KEEPS A TRACE IF ANY OF ITS GENERATIONS MATCHES, and the match is a
  case-insensitive substring — --model gpt also keeps gpt-4o. A kept trace's
  cost still covers every model it used, not only the one you filtered on.
  GENS is the generation count for the trace. It is correct here; the same
  field from "tracing trace <id>" is capped at 100 (see that command).`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.tracing.listTraces({
        ...getPaginationParams(opts),
        status: opts.status,
        agentId: opts.agentId,
        workflowId: opts.workflowId,
        model: opts.model,
        startDate: opts.startDate,
        endDate: opts.endDate,
        sortBy: opts.sortBy,
        order: opts.order
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "status", label: "STATUS", width: 12, format: formatStatus },
        { key: "agentName", label: "AGENT", width: 20 },
        { key: "workflowName", label: "WORKFLOW", width: 20 },
        {
          key: "totalCostUsd",
          label: "COST ($)",
          width: 10,
          format: (v) => (v != null ? `$${Number(v).toFixed(4)}` : "-")
        },
        {
          key: "totalDurationMs",
          label: "DURATION",
          width: 10,
          format: (v) => (v != null ? `${Number(v)}ms` : "-")
        },
        { key: "generationCount", label: "GENS", width: 5 },
        { key: "startedAt", label: "STARTED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── trace (get) ───────────────────────────────────────────────────────
  tracing
    .command("trace")
    .description("Get trace details with generations")
    .argument("<id>", "Trace ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing trace abc-123
  $ nexus tracing trace abc-123 --json

Notes:
  THE GENERATIONS LIST IS CAPPED AT 100 AND SAYS SO NOWHERE. A trace with more
  than 100 model calls returns the first 100 by start time, and its
  generationCount is recomputed from that truncated array — so this command
  reports 100 while "tracing traces" reports the real number for the same
  trace. Cross-check there, and page the rest with
  "nexus tracing generations --trace-id <id>".
  STILL NO PROMPTS. The nested generations carry metadata only; the prompt,
  messages and response need "nexus tracing generation <generation-id> --json".
  Cost and duration render "-" for null, which is not zero — an IN_PROGRESS
  trace has no total yet.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const trace = await client.tracing.getTrace(id);
        printRecord(trace, [
          { key: "id", label: "ID" },
          { key: "status", label: "Status" },
          { key: "agentName", label: "Agent" },
          { key: "workflowName", label: "Workflow" },
          {
            key: "totalCostUsd",
            label: "Cost ($)",
            format: (v) => (v != null ? `$${Number(v).toFixed(4)}` : "-")
          },
          { key: "totalInputTokens", label: "Input Tokens" },
          { key: "totalOutputTokens", label: "Output Tokens" },
          { key: "totalDurationMs", label: "Duration (ms)" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" }
        ]);

        // In JSON mode the trace object already carries `generations` nested,
        // so printRecord above emitted them inside the single JSON document.
        // Only render the human-readable generations table for non-JSON output —
        // emitting a second JSON value here would break parsers (NEX-2176).
        const gens = trace.generations;
        if (!isJsonMode() && gens && gens.length > 0) {
          console.log(`\n${color.bold("Generations")} (${gens.length}):\n`);
          printList(gens, undefined, [
            { key: "id", label: "ID", width: 36 },
            { key: "modelName", label: "MODEL", width: 25 },
            { key: "status", label: "STATUS", width: 12, format: formatStatus },
            {
              key: "costUsd",
              label: "COST ($)",
              width: 10,
              format: (v) => (v != null ? `$${Number(v).toFixed(6)}` : "-")
            },
            {
              key: "durationMs",
              label: "DURATION",
              width: 10,
              format: (v) => (v != null ? `${v}ms` : "-")
            }
          ]);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  tracing
    .command("delete")
    .description("Delete a trace and every generation under it — permanent, no confirmation")
    .argument("<id>", "Trace ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing delete abc-123

Notes:
  IT TAKES THE GENERATIONS WITH IT. Every model call recorded under this
  trace — prompts, messages, responses, costs — is deleted, and none of it is
  named in the request or the response.
  NO CONFIRMATION AND NO --yes FLAG. This command deletes the moment you press
  enter, on a TTY or in a script alike.
  There is no undo and no export-on-delete. Run "nexus tracing export <id>"
  first if the record matters.
  Verify with "nexus tracing trace <id>", which then answers 404.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.tracing.deleteTrace(id);
        printSuccess("Trace deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── generations ───────────────────────────────────────────────────────
  addPaginationOptions(
    tracing
      .command("generations")
      .description("List LLM generations across traces")
      .option("--trace-id <id>", "Filter by trace ID")
      .option("--provider <provider>", "Filter by provider (OPEN_AI, ANTHROPIC, GOOGLE_AI)")
      .option("--model <name>", "Filter by model name (max 255 chars)")
      .option("--status <status>", "Filter by status (PENDING, RUNNING, COMPLETED, FAILED)")
      .option("--agent-id <id>", "Filter by agent ID")
      .option("--task-id <id>", "Filter by task ID")
      .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
      .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
      .option("--min-cost <usd>", "Minimum cost in USD")
      .option("--max-cost <usd>", "Maximum cost in USD")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus tracing generations
  $ nexus tracing generations --provider ANTHROPIC --status FAILED
  $ nexus tracing generations --trace-id abc-123 --json

Notes:
  NO PROMPTS, MESSAGES OR RESPONSES HERE, at any --limit and under --json.
  This endpoint omits them; only "nexus tracing generation <id> --json"
  returns them, one generation at a time.
  THIS IS THE UNCAPPED WAY TO READ A LONG TRACE. Paired with --trace-id it
  pages past the 100-generation ceiling of "tracing trace <id>".
  --min-cost / --max-cost are USD and are compared against the stored cost,
  so a generation whose cost is null matches NEITHER bound and disappears from
  a filtered list. Leave both off to see unpriced calls.
  --status here is PENDING, RUNNING, COMPLETED or FAILED — a different set from
  the trace statuses (IN_PROGRESS, COMPLETED, FAILED).
  --model is a CASE-INSENSITIVE SUBSTRING match, not an exact one: --model gpt
  also returns gpt-4o and gpt-4o-mini. Use "nexus tracing models" for the exact
  names, and pass a full one when you mean only that model.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.tracing.listGenerations({
        ...getPaginationParams(opts),
        traceId: opts.traceId,
        provider: opts.provider,
        modelName: opts.model,
        status: opts.status,
        agentId: opts.agentId,
        taskId: opts.taskId,
        startDate: opts.startDate,
        endDate: opts.endDate,
        minCostUsd: opts.minCost ? parseFloat(opts.minCost) : undefined,
        maxCostUsd: opts.maxCost ? parseFloat(opts.maxCost) : undefined
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "traceId", label: "TRACE", width: 36 },
        { key: "modelName", label: "MODEL", width: 25 },
        { key: "status", label: "STATUS", width: 12, format: formatStatus },
        {
          key: "costUsd",
          label: "COST ($)",
          width: 10,
          format: (v) => (v != null ? `$${Number(v).toFixed(6)}` : "-")
        },
        {
          key: "durationMs",
          label: "DURATION",
          width: 10,
          format: (v) => (v != null ? `${v}ms` : "-")
        }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── generation (get) ──────────────────────────────────────────────────
  tracing
    .command("generation")
    .description("Get one generation — the ONLY source of the prompt, messages and response")
    .argument("<id>", "Generation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing generation gen-123 --json
  $ nexus tracing generation gen-123 --json | jq -r .systemPrompt
  $ nexus tracing generation gen-123

Notes:
  USE --json OR YOU WILL NOT SEE THE PROMPT. The table view prints metadata
  only — no systemPrompt, no messages, no tools, no response, no responseJson.
  They are in the response either way; only --json renders them.
  THIS IS THE ONLY ENDPOINT THAT CARRIES THEM. "tracing generations" and
  "tracing trace" both omit them, so there is no way to bulk-read prompts
  short of one call per generation.
  finishReason IS NULL WHEN THE STORED VALUE IS NOT ONE THIS API RECOGNISES —
  it is coerced to null rather than reported, so null means "unrecognised or
  absent", never "the model gave no reason".
  Cost renders "-" for null, which is not zero — an unpriced model records no
  cost at all.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const gen = await client.tracing.getGeneration(id);
        printRecord(gen, [
          { key: "id", label: "ID" },
          { key: "traceId", label: "Trace ID" },
          { key: "provider", label: "Provider" },
          { key: "modelName", label: "Model" },
          { key: "status", label: "Status" },
          { key: "inputTokens", label: "Input Tokens" },
          { key: "outputTokens", label: "Output Tokens" },
          {
            key: "costUsd",
            label: "Cost ($)",
            format: (v) => (v != null ? `$${Number(v).toFixed(6)}` : "-")
          },
          { key: "durationMs", label: "Duration (ms)" },
          { key: "temperature", label: "Temperature" },
          { key: "taskName", label: "Task" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" },
          { key: "errorMessage", label: "Error" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── models ────────────────────────────────────────────────────────────
  tracing
    .command("models")
    .description("List distinct model names used in traces")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing models
  $ nexus tracing models --json

Notes:
  DISTINCT MODEL NAMES FROM GENERATIONS STILL IN RETENTION, one per line, sorted.
  A model your organization used last month but not this week is NOT here — the
  list is bounded by the trace window, not by what you have ever run.
  Prints nothing but "No models found." when empty. Under --json it is a plain
  array of strings, not an object.
  Use these exact strings with --model on "tracing traces" / "tracing
  generations", where the match is a case-insensitive substring.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const models = await client.tracing.listModels();
        const list = Array.isArray(models) ? models : [];

        if (isJsonMode()) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        if (list.length === 0) {
          console.log("No models found.");
          return;
        }

        for (const m of list) console.log(m);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── summary ───────────────────────────────────────────────────────────
  tracing
    .command("summary")
    .description("Get tracing analytics summary")
    .option("--start-date <iso>", "Period start (ISO 8601)")
    .option("--end-date <iso>", "Period end (ISO 8601)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing summary
  $ nexus tracing summary --start-date 2026-03-01 --end-date 2026-03-30
  $ nexus tracing summary --json

Notes:
  TOTAL COST ($) 0.0000 CAN MEAN "NO TRACES", NOT "NO SPEND". The sum is
  reported as 0 when nothing matched, so read Total Traces beside it before
  concluding anything about money.
  WITH NO DATES THIS COVERS THE RETENTION WINDOW ONLY, so it is never a
  lifetime total.
  THE PERIOD-OVER-PERIOD COMPARISON IS --json ONLY, and only appears when you
  pass BOTH --start-date and --end-date. The previous period is then the window
  of the same length immediately before yours, and the table view never shows
  it. With one date or none, previousPeriod is null.
  Completed + Failed + In Progress can be less than Total Traces — a status
  outside those three is counted in the total and in none of the three.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const summary = await client.tracing.getSummary({
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        printRecord(summary, [
          { key: "totalTraces", label: "Total Traces" },
          { key: "completedTraces", label: "Completed" },
          { key: "failedTraces", label: "Failed" },
          { key: "inProgressTraces", label: "In Progress" },
          {
            key: "totalCostUsd",
            label: "Total Cost ($)",
            format: (v) => `$${Number(v).toFixed(4)}`
          },
          { key: "totalInputTokens", label: "Input Tokens" },
          { key: "totalOutputTokens", label: "Output Tokens" },
          {
            key: "avgDurationMs",
            label: "Avg Duration",
            format: (v) => (v != null ? `${Number(v).toFixed(0)}ms` : "-")
          },
          { key: "distinctModelCount", label: "Distinct Models" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── cost-breakdown ────────────────────────────────────────────────────
  tracing
    .command("cost-breakdown")
    .description("Get cost breakdown by model, agent, or workflow")
    .option("--group-by <key>", "Group by one key — see Notes; not repeatable", "model")
    .option("--start-date <iso>", "Period start")
    .option("--end-date <iso>", "Period end")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing cost-breakdown
  $ nexus tracing cost-breakdown --group-by agent
  $ nexus tracing cost-breakdown --group-by workflow --json

Notes:
  --group-by TAKES MORE THAN THE THREE IN THE EXAMPLES. deployment, customer and
  workflowExecution are accepted too, and a rejected value prints the full
  accepted set — read that refusal rather than trusting any list. It defaults to
  model.
  REPEATING --group-by SILENTLY KEEPS ONLY THE LAST ONE. The server groups by a
  LIST, but this flag is not repeatable, so "--group-by model --group-by agent"
  returns the agent grouping alone, with nothing saying model was discarded. Ask
  for one grouping per call.
  THE LABEL COLUMN IS EMPTY FOR SOME GROUPINGS, LEAVING A BARE UUID IN KEY.
  Grouping by agent is the common case — resolve those with "nexus agent get".
  Grouping by workflow or deployment does fill LABEL.
  THE ROWS DO NOT ADD UP TO YOUR BILL. Grouped by agent or workflow, only
  generations whose recorded context names one is counted — anything run
  outside an agent or a workflow is in no row at all, so the column total is
  a lower bound on spend, never the whole of it.
  TRACES is DISTINCT traces touching that group, so summing the TRACES column
  double-counts any trace that used two models.
  Same retention window as everything else: this is at most the last few days
  unless you narrow it further with --start-date / --end-date.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.getCostBreakdown({
          groupBy: opts.groupBy,
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        const entries = result.entries ?? [];
        printList(entries, undefined, [
          { key: "groupKey", label: "KEY", width: 36 },
          { key: "groupLabel", label: "LABEL", width: 25 },
          {
            key: "totalCostUsd",
            label: "COST ($)",
            width: 12,
            format: (v) => `$${Number(v).toFixed(4)}`
          },
          { key: "traceCount", label: "TRACES", width: 8 },
          { key: "generationCount", label: "GENS", width: 8 },
          { key: "totalInputTokens", label: "IN TOKENS", width: 12 },
          { key: "totalOutputTokens", label: "OUT TOKENS", width: 12 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── timeline ──────────────────────────────────────────────────────────
  const timeline = tracing
    .command("timeline")
    .description("Get tracing timeline data")
    .addOption(
      enumOption(
        "--granularity <g>",
        "Granularity",
        TRACING_ANALYTICS_TIMELINE__PARAMS_GRANULARITY
      ).default("day")
    )
    .option("--start-date <iso>", "Period start")
    .option("--end-date <iso>", "Period end")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing timeline
  $ nexus tracing timeline --granularity hour --start-date 2026-03-29 --json

Notes:
  --granularity TAKES hour, day OR week, and defaults to day. Anything else is
  refused.
  BUCKETS WITH NO TRACES ARE ABSENT, NOT ZERO. The series is not gap-filled, so
  a quiet hour is a MISSING ROW — a chart that joins consecutive points will
  draw straight through the gap. Fill the gaps yourself from the dates you
  asked for.
  Buckets are cut on the trace's START time, so a run spanning midnight sits
  entirely in the bucket it began in.
  COST ($) 0.0000 in a bucket is a real zero for that bucket; a bucket with no
  cost at all is missing rather than zero.
  Same retention window as everything else — "--granularity week" over a
  7-day window gives you one or two rows, not a quarter.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.getTimeline({
          granularity: opts.granularity,
          startDate: opts.startDate,
          endDate: opts.endDate
        });
        const points = result.points ?? [];
        printList(points, undefined, [
          { key: "date", label: "DATE", width: 22 },
          { key: "traceCount", label: "TRACES", width: 8 },
          { key: "generationCount", label: "GENS", width: 8 },
          {
            key: "totalCostUsd",
            label: "COST ($)",
            width: 12,
            format: (v) => `$${Number(v).toFixed(4)}`
          },
          {
            key: "avgDurationMs",
            label: "AVG DUR",
            width: 10,
            format: (v) => (v != null ? `${Number(v).toFixed(0)}ms` : "-")
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── export ────────────────────────────────────────────────────────────
  const exportTrace = tracing
    .command("export")
    .description("Export a single trace")
    .argument("<id>", "Trace ID")
    .addOption(
      enumOption("--format <fmt>", "Output format", TRACING_EXPORT_TRACE__BODY_FORMAT).default(
        "json"
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing export abc-123 > trace.json
  $ nexus tracing export abc-123 --format csv > trace.csv

Notes:
  IT PRINTS THE PAYLOAD TO STDOUT AND NOTHING ELSE — redirect it to a file.
  --json does NOT apply here: the document is already the output, and asking
  for --format csv while passing --json still gives you CSV.
  --format takes json or csv, and defaults to json. CSV is one row per
  generation, so a trace with no generations exports headers only.
  THIS IS HOW YOU BEAT THE RETENTION WINDOW. Nothing is archived for you — an
  unexported trace is unrecoverable once it expires.
  Exports are rate limited; a burst answers 429.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.exportTrace(id, { format: opts.format });
        console.log(result.content);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── export-bulk ───────────────────────────────────────────────────────
  const exportBulk = tracing
    .command("export-bulk")
    .description("Bulk export traces — max 500 per call, rate limited to 5 calls a minute")
    .addOption(
      enumOption("--format <fmt>", "Output format", TRACING_EXPORT_BULK__BODY_FORMAT).default(
        "json"
      )
    )
    .addOption(
      enumOption("--status <status>", "Filter by status", TRACING_EXPORT_BULK__BODY_STATUS)
    )
    .option("--agent-id <id>", "Filter by agent ID")
    .option("--workflow-id <id>", "Filter by workflow ID")
    .option("--start-date <iso>", "Filter from date")
    .option("--end-date <iso>", "Filter to date")
    .option("--limit <n>", "Max traces to export (1-500, default 100)", "100")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing export-bulk --format csv > traces.csv
  $ nexus tracing export-bulk --status FAILED --limit 50
  $ nexus tracing export-bulk --limit 500 --start-date 2026-03-01 > march.json

Notes:
  --limit IS CAPPED AT 500 AND IS NOT PAGED. Asking for more is refused
  outright, and there is no cursor — narrow with --start-date / --end-date and
  export the window in slices. The default is 100, so a bare call SILENTLY
  EXPORTS ONLY THE FIRST 100 traces and says nothing about the rest.
  RATE LIMITED TO 5 CALLS PER MINUTE. The sixth answers 429, so a slicing loop
  needs to pace itself.
  IT PRINTS THE PAYLOAD TO STDOUT AND NOTHING ELSE — redirect it to a file.
  --format takes json or csv, default json.
  Count what you got against "nexus tracing traces --json" for the same filters
  before treating an export as complete.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.bulkExport({
          format: opts.format,
          status: opts.status,
          agentId: opts.agentId,
          workflowId: opts.workflowId,
          startDate: opts.startDate,
          endDate: opts.endDate,
          limit: parseInt(opts.limit, 10)
        });
        console.log(result.content);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  //
  // `traces`, `generations` and `cost-breakdown` are DELIBERATELY ABSENT. Each
  // carries a contract enum this CLI has no flag for — `source` on traces,
  // `sortBy` and `order` on generations, `bucket` on cost-breakdown — and the
  // gate is all-or-nothing per descriptor. Binding them means ADDING FLAGS,
  // which is a change to what the CLI can do rather than to what it says, so it
  // is left to a decision rather than taken here.
  bindCommand(timeline, TRACING_ANALYTICS_TIMELINE_CONTRACT);
  bindCommand(exportTrace, TRACING_EXPORT_TRACE_CONTRACT);
  bindCommand(exportBulk, TRACING_EXPORT_BULK_CONTRACT);
}

function formatStatus(v: unknown): string {
  const s = String(v);
  if (s === "COMPLETED") return color.green(s);
  if (s === "FAILED") return color.red(s);
  if (s === "IN_PROGRESS" || s === "RUNNING") return color.yellow(s);
  if (s === "PENDING") return color.dim(s);
  return s;
}
