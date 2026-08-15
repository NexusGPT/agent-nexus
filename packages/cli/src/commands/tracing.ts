import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { color, isJsonMode, printList, printRecord, printSuccess } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  TRACING_ANALYTICS_COST_BREAKDOWN__PARAMS_BUCKET,
  TRACING_ANALYTICS_COST_BREAKDOWN_CONTRACT,
  TRACING_ANALYTICS_TIMELINE__PARAMS_GRANULARITY,
  TRACING_ANALYTICS_TIMELINE_CONTRACT,
  TRACING_EXPORT_BULK__BODY_FORMAT,
  TRACING_EXPORT_BULK__BODY_STATUS,
  TRACING_EXPORT_BULK_CONTRACT,
  TRACING_EXPORT_TRACE__BODY_FORMAT,
  TRACING_EXPORT_TRACE_CONTRACT,
  TRACING_LIST_GENERATIONS__PARAMS_ORDER,
  TRACING_LIST_GENERATIONS__PARAMS_PROVIDER,
  TRACING_LIST_GENERATIONS__PARAMS_SORT_BY,
  TRACING_LIST_GENERATIONS__PARAMS_STATUS,
  TRACING_LIST_GENERATIONS_CONTRACT,
  TRACING_LIST_TRACES__PARAMS_ORDER,
  TRACING_LIST_TRACES__PARAMS_SORT_BY,
  TRACING_LIST_TRACES__PARAMS_SOURCE,
  TRACING_LIST_TRACES__PARAMS_STATUS,
  TRACING_LIST_TRACES_CONTRACT
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
  const traces = addPaginationOptions(
    tracing
      .command("traces")
      .description("List LLM traces")
      .addOption(
        enumOption("--status <status>", "Filter by status", TRACING_LIST_TRACES__PARAMS_STATUS)
      )
      .option("--agent-id <id>", "Filter by agent ID")
      .option("--workflow-id <id>", "Filter by workflow ID")
      .option("--model <name>", "Filter by model name (max 255 chars)")
      .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
      .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
      .addOption(
        enumOption(
          "--source <surface>",
          "Filter by the surface that produced the trace",
          TRACING_LIST_TRACES__PARAMS_SOURCE
        )
      )
      .addOption(
        enumOption("--sort-by <field>", "Sort by field", TRACING_LIST_TRACES__PARAMS_SORT_BY)
      )
      .addOption(enumOption("--order <dir>", "Sort order", TRACING_LIST_TRACES__PARAMS_ORDER))
      .addHelpText(
        "after",
        `
Examples:
  $ nexus tracing traces
  $ nexus tracing traces --status FAILED --limit 10
  $ nexus tracing traces --agent-id 4c6e1a82-3f7d-4b90-a512-8d0e6c9b7f34 --start-date 2026-03-01 --json

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
  --status, --source, --sort-by and --order are validated LOCALLY against the
  contract, so a bad value is refused here and never becomes a 400. --sort-by
  defaults to startedAt and --order to desc; both defaults live on the SERVER,
  so unset the CLI sends neither.
  --source NAMES THE SURFACE THAT PRODUCED THE TRACE, and it matches on a key
  the trace recorded in its context — so a trace with no context matches no
  --source at all and is only reachable unfiltered, exactly like --agent-id.
  agent-creation and ai-task-creation are two separate values on purpose:
  historic AI-task rows recorded their thread under the agent-creation key, so
  the older value still answers for them.
  --model KEEPS A TRACE IF ANY OF ITS GENERATIONS MATCHES, and the match is a
  case-insensitive substring — --model gpt also keeps gpt-4o. A kept trace's
  cost still covers every model it used, not only the one you filtered on.
  GENS is the generation count for the trace. It is correct here; the same
  field from "tracing trace <id>" is capped at 100 (see that command).
  --limit IS 1-100 AND DEFAULTS TO 20; --page DEFAULTS TO 1. Above 100 is a 400
  and never a clamp, so a script asking for 500 gets nothing rather than 100.
  That is the page contract every list command here shares, and it is NOT the
  one "tracing export-bulk" documents: that flag runs 1-500 and defaults to 100,
  because an export is a file and this is a page. Walk a long result with
  --page, never with a bigger --limit.`
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
        source: opts.source,
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
  $ nexus tracing trace 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b
  $ nexus tracing trace 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b --json

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
  $ nexus tracing delete 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b

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
  const generations = tracing
    .command("generations")
    .description("List LLM generations across traces")
    .option("--trace-id <id>", "Filter by trace ID")
    .addOption(
      enumOption(
        "--provider <provider>",
        "Filter by provider",
        TRACING_LIST_GENERATIONS__PARAMS_PROVIDER
      )
    )
    .option("--model <name>", "Filter by model name (max 255 chars)")
    .addOption(
      enumOption("--status <status>", "Filter by status", TRACING_LIST_GENERATIONS__PARAMS_STATUS)
    )
    .option("--agent-id <id>", "Filter by agent ID")
    .option("--task-id <id>", "Filter by task ID")
    .option("--start-date <iso>", "Filter from date (ISO 8601, e.g. 2026-03-01)")
    .option("--end-date <iso>", "Filter to date (ISO 8601, e.g. 2026-03-01)")
    .option("--min-cost <usd>", "Minimum cost in USD")
    .option("--max-cost <usd>", "Maximum cost in USD")
    .addOption(
      enumOption(
        "--sort-by <field>",
        "Sort by field",
        TRACING_LIST_GENERATIONS__PARAMS_SORT_BY
      ).default("startedAt")
    )
    .addOption(
      enumOption("--order <dir>", "Sort order", TRACING_LIST_GENERATIONS__PARAMS_ORDER).default(
        "desc"
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing generations
  $ nexus tracing generations --provider ANTHROPIC --status FAILED
  $ nexus tracing generations --trace-id 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b --json
  $ nexus tracing generations --sort-by costUsd --order desc --limit 10

Notes:
  NO PROMPTS, MESSAGES OR RESPONSES HERE, at any --limit and under --json.
  This endpoint omits them; only "nexus tracing generation <id> --json"
  returns them, one generation at a time.
  THIS IS THE UNCAPPED WAY TO READ A LONG TRACE. Paired with --trace-id it
  pages past the 100-generation ceiling of "tracing trace <id>".
  --min-cost / --max-cost are USD and are compared against the stored cost,
  so a generation whose cost is null matches NEITHER bound and disappears from
  a filtered list. Leave both off to see unpriced calls.
  --status here is a DIFFERENT SET from the trace statuses, which are
  IN_PROGRESS, COMPLETED and FAILED.
  --provider TAKES A MODEL PROVIDER, NOT A CHANNEL. A provider with no recorded
  generation returns an empty page rather than an error, so an empty result is
  "nothing ran on it" and never "that provider does not exist".
  A NULL COST SORTS LAST IN BOTH DIRECTIONS, on --sort-by costUsd and on
  --sort-by duration-ms alike, so the first page of "most expensive" is the
  most expensive. Null means NOT PRICED — no usage was ever recorded for it —
  and it is never zero, so it is neither the dearest nor the cheapest. Cost
  renders "-" for it.
  A NULL COST ON A **COMPLETED** GENERATION IS NORMAL AND IS NOT A BUG. An
  ABORTED generation is stored with status COMPLETED, and the abort path writes
  no cost. So the three states that leave cost null are RUNNING, FAILED, and
  COMPLETED-because-aborted.
  --model is a CASE-INSENSITIVE SUBSTRING match, not an exact one: --model gpt
  also returns gpt-4o and gpt-4o-mini. Use "nexus tracing models" for the exact
  names, and pass a full one when you mean only that model.
  THE TABLE SHOWS 6 COLUMNS AND A --json ROW CARRIES 26 KEYS. The twenty you
  cannot see are the whole reason to pass --json:
    provider, nodeId, taskId, taskName, metadata, startedAt, completedAt,
      errorMessage, responseId, finishReason, temperature, isAborted;
    inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens,
      reasoningTokens — the token classes priced apart from one another;
    ttftMs, streamDurationMs, thinkingDurationMs — the split behind durationMs.
  --json here is {data, meta}, NOT the bare array "tracing export-bulk" writes.
  --limit IS 1-100 AND DEFAULTS TO 20; --page DEFAULTS TO 1. Above 100 is a 400
  and never a clamp, so a script asking for 500 gets nothing rather than 100.
  Walk a long trace with --page, never with a bigger --limit.`
    );

  addPaginationOptions(generations).action(async (opts) => {
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
        maxCostUsd: opts.maxCost ? parseFloat(opts.maxCost) : undefined,
        sortBy: opts.sortBy,
        order: opts.order
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
  $ nexus tracing generation 2d9c8b71-6e05-4f3a-9c18-5b7a4e6d0f21 --json
  $ nexus tracing generation 2d9c8b71-6e05-4f3a-9c18-5b7a4e6d0f21 --json | jq -r .systemPrompt
  $ nexus tracing generation 2d9c8b71-6e05-4f3a-9c18-5b7a4e6d0f21

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
  Cost renders "-" for null, which is not zero and does NOT mean the model has
  no price. A model missing from the pricing catalog is recorded at 0, with a
  warning in the server log. Null means the cost column was never written:
  the generation is still RUNNING, or it terminated before any usage was
  recorded. A terminated one reads FAILED, or COMPLETED when it was ABORTED —
  the abort path stores status COMPLETED and writes no cost, so a COMPLETED
  generation showing "-" is expected rather than a gap.`
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
  outside those three is counted in the total and in none of the three.
  UNPRICED CALLS > 0 MEANS TOTAL COST ($) IS LOW BY AN UNKNOWN AMOUNT. Those
  calls had no price to look up and sit in the total at $0. The row discloses
  it; it never corrects the total, because the missing amount is unknown rather
  than merely unreported. "nexus tracing cost-breakdown" and "timeline" carry
  the same column per group and per bucket, which is where you find WHICH spend
  is missing.`
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
          { key: "distinctModelCount", label: "Distinct Models" },
          {
            key: "unpricedGenerationCount",
            label: "Unpriced Calls",
            // A bare number reads as a statistic. It is a caveat on the line
            // above it: those calls are in Total Cost at $0, so the total is LOW
            // by an unknown amount. Say so, rather than leaving the reader to
            // know that a spend total silently absorbs what it could not price.
            format: (v) =>
              Number(v) > 0
                ? `${Number(v)} — no price found, so Total Cost is LOW by an unknown amount`
                : "0"
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── cost-breakdown ────────────────────────────────────────────────────
  const costBreakdown = tracing
    .command("cost-breakdown")
    .description("Get cost breakdown by model, agent, or workflow")
    .option("--group-by <key>", "Group by one key — see Notes; not repeatable", "model")
    .option("--start-date <iso>", "Period start")
    .option("--end-date <iso>", "Period end")
    .addOption(
      enumOption(
        "--bucket <g>",
        "Also split each group into time buckets",
        TRACING_ANALYTICS_COST_BREAKDOWN__PARAMS_BUCKET
      )
    )
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
  LABEL IS EMPTY WHENEVER THE THING IT NAMES IS GONE, LEAVING A BARE UUID IN KEY.
  Every dimension except model resolves its label by a lookup — agent,
  workflow, deployment and customer alike — so a deleted referent, or one in
  another organization, renders KEY with nothing beside it. Resolve those with
  "nexus agent get" and its siblings. Grouping by model never blanks: there the
  key IS the name. Grouping by customer also blanks when the customer has
  neither a display name nor a primary email.
  workflowExecution LABELS THE WORKFLOW, NOT THE RUN, so two runs of one
  workflow carry the same LABEL and are told apart only by KEY.
  THE ROWS DO NOT ADD UP TO YOUR BILL. Grouped by agent or workflow, only
  generations whose recorded context names one is counted — anything run
  outside an agent or a workflow is in no row at all, so the column total is
  a lower bound on spend, never the whole of it.
  TRACES is DISTINCT traces touching that group, so summing the TRACES column
  double-counts any trace that used two models.
  UNPRICED > 0 MEANS THAT ROW'S COST ($) IS LOW BY AN UNKNOWN AMOUNT. Those
  calls had no price to look up, so they are in the row's cost at $0 — a group
  whose whole traffic is unpriced reads as $0.0000, i.e. indistinguishable from
  a group that spent nothing. UNPRICED is a subset of GENS, never larger, and
  is a disclosure rather than a correction: COST ($) is not adjusted by it.
  Ranking by cost with a non-zero UNPRICED anywhere is ranking on an incomplete
  column — read UNPRICED before concluding which group is cheapest.
  --bucket SPLITS EACH GROUP INTO A TIME SERIES, one row per (group key x
  bucket) instead of one aggregate per group key, and adds a BUCKET column. IT
  IS REJECTED WITH A 400 FOR model, agent AND workflow — only the attribution
  dimensions (deployment, customer, workflowExecution) support it. Use "nexus
  tracing timeline" for an org-wide series instead.
  Same retention window as everything else: this is at most the last few days
  unless you narrow it further with --start-date / --end-date.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracing.getCostBreakdown({
          groupBy: opts.groupBy,
          startDate: opts.startDate,
          endDate: opts.endDate,
          bucket: opts.bucket
        });
        const entries = result.entries ?? [];
        printList(entries, undefined, [
          { key: "groupKey", label: "KEY", width: 36 },
          { key: "groupLabel", label: "LABEL", width: 25 },
          // Only when asked for. Unbucketed, every row's `bucket` is null, and a
          // column of dashes reads as missing data rather than as not-requested.
          ...(opts.bucket ? [{ key: "bucket" as const, label: "BUCKET", width: 22 }] : []),
          {
            key: "totalCostUsd",
            label: "COST ($)",
            width: 12,
            format: (v) => `$${Number(v).toFixed(4)}`
          },
          { key: "traceCount", label: "TRACES", width: 8 },
          { key: "generationCount", label: "GENS", width: 8 },
          // A table cannot carry the caveat the summary's single value can, so
          // the Notes above own the sentence and this column owns the number.
          { key: "unpricedGenerationCount", label: "UNPRICED", width: 9 },
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
  UNPRICED > 0 MEANS THAT BUCKET'S COST ($) IS LOW BY AN UNKNOWN AMOUNT. Those
  calls had no price to look up and sit in the bucket's cost at $0. Watch this
  column across the series: a model that stops being priced makes COST ($)
  FLATTEN while GENS keeps climbing, which reads exactly like traffic that got
  cheaper. UNPRICED is a subset of GENS and never corrects COST ($).
  Same retention window as everything else — "--granularity week" over a
  7-day window gives you one or two rows, not a quarter.
  THE DATE COLUMN IS CUT, AND THE BUCKET KEY IS NOT A DATE. The server sends a
  full ISO instant — 2026-08-06T00:00:00.000Z, 24 characters — into a column 22
  wide, so every row renders 2026-08-06T00:00:00.0… at every granularity. Key a
  chart off the "date" field under --json, never off the table: the cut string
  parses as a different instant, or as nothing at all. "tracing cost-breakdown
  --bucket" cuts its own BUCKET column the same way.`
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
          { key: "unpricedGenerationCount", label: "UNPRICED", width: 9 },
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
  $ nexus tracing export 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b > trace.json
  $ nexus tracing export 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b --format csv > trace.csv

Notes:
  IT PRINTS THE PAYLOAD TO STDOUT AND NOTHING ELSE — redirect it to a file.
  --json does NOT apply here: the document is already the output, and asking
  for --format csv while passing --json still gives you CSV.
  --format takes json or csv, and defaults to json. CSV is one row per
  generation, so a trace with no generations exports headers only.
  THIS IS HOW YOU BEAT THE RETENTION WINDOW. Nothing is archived for you — an
  unexported trace is unrecoverable once it expires.
  UNDER --format json THE DOCUMENT IS A BARE OBJECT — one trace, its generations
  nested in a "generations" array. No data/meta envelope and no outer array, so
  this command and "export-bulk" need DIFFERENT parsers: export-bulk hands back
  a LIST of exactly this object.
  THE NESTED GENERATIONS ARE UNCAPPED HERE, where "tracing trace <id>" stops at
  100 — and they still carry no systemPrompt, no messages and no response.
  This route is NOT under the five-calls-a-minute throttle that "export-bulk"
  documents; only export-bulk is. The plan's own rate limit still applies, so a
  burst can answer 429 at a different threshold.`
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
  before treating an export as complete.
  UNDER --format json THE DOCUMENT IS A BARE ARRAY, with no data/meta envelope.
  Every list command here answers {data, meta}; this one does not, because it is
  a file and not a page — iterate the top level directly, since a ".data" read
  finds nothing. Each element is one trace in exactly the shape
  "tracing export <id>" writes, its generations nested inside it and UNCAPPED.
  --json CHANGES NOTHING HERE. This command never reads it; the payload is
  already the output, and --format decides its form.`
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
  // `traces` and `cost-breakdown` were the last two absentees, each held back by
  // ONE enum with no flag — `source` on traces, `bucket` on cost-breakdown —
  // while the gate is all-or-nothing per descriptor. Both flags were added
  // rather than deferred, which is the same decision `generations` took.
  //
  // What that cost on `traces` is the reason to take it: unbound, `--status`,
  // `--sort-by` and `--order` hand-typed their values in DESCRIPTIONS and
  // validated nothing, and the leaf's own Notes claimed "any other value is
  // refused". Driven, `--sort-by __junk__` reached the network. A help text
  // asserting a refusal nothing performs is worse than one saying nothing.
  //
  // 🚨 `--bucket` IS A GUARANTEED 400 ON THIS COMMAND'S DEFAULT. The server
  // accepts it only when every `groupBy` dimension is an FK dimension
  // (deployment, customer, workflowExecution) and `--group-by` defaults to
  // `model`. That coupling is DELIBERATELY not re-implemented here: the FK
  // subset is nowhere in the contract, so a local check would be a hand-typed
  // second copy of a server rule — the exact drift this binding exists to kill.
  // The server refuses by name; the Notes say so.
  bindCommand(traces, TRACING_LIST_TRACES_CONTRACT);
  bindCommand(costBreakdown, TRACING_ANALYTICS_COST_BREAKDOWN_CONTRACT);
  bindCommand(generations, TRACING_LIST_GENERATIONS_CONTRACT);
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
