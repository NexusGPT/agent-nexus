import type {
  CreateAgentEvalBatchBody,
  CreateAgentEvalRunBody,
  CreateAgentEvalScheduleBody,
  CreateAgentEvalTemplateBody,
  UpdateAgentEvalScheduleBody,
  UpdateAgentEvalTemplateBody,
  UpsertAgentEvalTriggerBody,
  UpsertAgentEvalWebhookBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { isJsonMode, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveRequiredBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  CONVERSATION_EVAL_BATCH_CREATE_CONTRACT,
  CONVERSATION_EVAL_BATCH_LIST__PARAMS_STATUS,
  CONVERSATION_EVAL_BATCH_LIST_CONTRACT,
  CONVERSATION_EVAL_RUN_CREATE__BODY_SOURCE_MODE,
  CONVERSATION_EVAL_RUN_CREATE_CONTRACT,
  CONVERSATION_EVAL_RUN_LIST__PARAMS_SOURCE_MODE,
  CONVERSATION_EVAL_RUN_LIST__PARAMS_STATUS,
  CONVERSATION_EVAL_RUN_LIST_CONTRACT,
  CONVERSATION_EVAL_SCHEDULE_CREATE_CONTRACT,
  CONVERSATION_EVAL_SCHEDULE_LIST__PARAMS_STATUS,
  CONVERSATION_EVAL_SCHEDULE_LIST_CONTRACT,
  CONVERSATION_EVAL_SCHEDULE_UPDATE_CONTRACT,
  CONVERSATION_EVAL_TEMPLATE_CREATE_CONTRACT,
  CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_KIND,
  CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_SCOPE,
  CONVERSATION_EVAL_TEMPLATE_LIST_CONTRACT,
  CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE__PARAMS_KIND,
  CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE_CONTRACT,
  CONVERSATION_EVAL_TRIGGER_LIST__PARAMS_KIND,
  CONVERSATION_EVAL_TRIGGER_LIST_CONTRACT,
  CONVERSATION_EVAL_TRIGGER_UPSERT_CONTRACT,
  CONVERSATION_EVAL_WEBHOOK_UPSERT_CONTRACT
} from "./agent-eval.contract.generated";

/**
 * `nexus agent-eval` — LLM-as-judge for multi-turn agent conversations.
 *
 * Every command here is one call on `client.agentEvals` — the SDK resource that
 * owns this surface. Mutating commands take a `--body` JSON blob (string, .json
 * file, or `-` for stdin) plus a few convenience flags.
 *
 * ## Why there is no `HttpClient` in this file any more (NEX-3909)
 *
 * This namespace used to build its own transport and name paths as strings.
 * That was not a shortcut past an SDK method — there was no `/agent-evals`
 * resource at all, and this file was the only client the domain had. It is what
 * the `--help` truth gate reported as its one `SDK-BYPASS`: the contract existed
 * and the CLI reached it without going through the SDK, so the arm that resolves
 * a command to a route by reading `client.x.y(` found nothing here and every
 * path operand in the namespace went unjudged.
 *
 * Routing through `createClient` also fixed two things the hand-rolled transport
 * silently did without, because it constructed `HttpClient` directly and passed
 * only four options:
 *
 *   - **the `organization-id` header.** A personal (cross-org) token selects its
 *     acting org with that header, and nothing here sent one — so every command
 *     in this namespace acted on whatever org the server defaulted to rather
 *     than the profile's selected one. Org-scoped keys were unaffected, which is
 *     why it went unnoticed.
 *   - **retry notices.** A rate-limited command waited in silence.
 *
 * Both come from `createClient` and neither is agent-eval-specific, which is the
 * argument for having no second transport in the tree at all.
 */
export function registerAgentEvalCommands(program: Command): void {
  const root = program
    .command("agent-eval")
    .description("LLM-as-judge evaluation of multi-turn agent conversations");

  root.addHelpText(
    "after",
    `
THIS NAMESPACE SCORES MULTI-TURN AGENT CONVERSATIONS. To evaluate a single AI
task's output against a dataset of inputs and expected outputs, you want
"nexus task-eval" instead — a different namespace with a different pipeline.

EVERY COMMAND HERE NEEDS THE CONVERSATION_EVAL FEATURE. With it off, all of them
answer 403 FORBIDDEN whatever the arguments — ask an org admin to enable it before
debugging anything else.

⚠️ THE 403 DOES NOT NAME THE FLAG. Its body reads only "This feature is not
enabled for your organization", which is the same sentence other gated features
send, so the error alone cannot tell you WHICH flag is missing or that a flag is
the problem at all. The flag is CONVERSATION_EVAL and only this help says so.

ASK WITH THE ONE READ THAT CHANGES NOTHING, before blaming your arguments:

  $ nexus agent-eval template list --scope GLOBAL

It is a plain GET, it creates no run and spends nothing. Exit 0 with rows means
the feature is ON and your problem is elsewhere in the command you were writing.
A 403 means the feature is OFF and NOTHING in this namespace will work until an
org admin enables it — every other 403 you get is that same cause, so stop
bisecting the arguments. A 401 is a bad key, which is a different problem.

A run's life: "run create" leaves it DRAFT, "run execute" queues it, the worker
takes it to RUNNING then COMPLETED or FAILED, and "run abort" ends it ABORTED.
Nothing runs at create time, so a run can be created wrong and only fail later.

Two facts about reading a finished run:
  • run.verdict IS WRITTEN ONLY WHEN THE RUN CARRIES A thresholdConfig. Create
    the run without one and the field stays null on a perfectly good COMPLETED
    run — there is no default and nothing reports the omission. With one, the
    run finishes PASS, FAIL or INCONCLUSIVE against those thresholds; a run that
    is ABORTED after the verdict was computed has it cleared back to null. So a
    null verdict means "no thresholds, or aborted", never "the judge had no
    opinion". The judged answer regardless of thresholds is run.summaryText,
    which is markdown, plus the per-criterion scores from "run results".
  • EVERY COST IS IN USD × 10,000. totalCostUsdTenThousandths: 12345 is $1.2345.
    Divide before showing it to anyone, and remember budgetCapUsdTenThousandths
    is in the same unit.`
  );

  /**
   * Print a value as this namespace has always printed one: raw JSON, indented
   * two spaces unless `--json` asked for the compact single-line form.
   *
   * ⚠️ The SHAPE is a compatibility surface, not a formatting choice.
   * `json-shape.generated.ts` pins it and `cli-surface.codegen.test.ts` has this
   * namespace at STABLE tier, so what reaches stdout must be byte-identical to
   * what the hand-rolled transport produced. A paginated list arrives from the
   * SDK already shaped `{ data, meta }`, which is exactly what it printed
   * before.
   */
  const emit = (value: unknown): void => {
    console.log(JSON.stringify(value, null, isJsonMode() ? undefined : 2));
  };

  /**
   * Print a route that serves a BARE ARRAY.
   *
   * It has always gone out under a `data` key with no `meta` — the old
   * transport took the `Array.isArray(data)` branch and `JSON.stringify` dropped
   * the undefined `meta` beside it. Three routes are in this class and they are
   * not an oversight: `run transcript`, `run compare` and `trigger list` are
   * served by handlers that pass no pagination meta. Wrapping them in a page
   * would invent a `meta` no payload ever carried.
   */
  const emitList = (data: readonly unknown[]): void => emit({ data });

  // ─────────────────────────────────────────────────────────────────────────
  // Runs
  // ─────────────────────────────────────────────────────────────────────────
  const run = root.command("run").description("Manage evaluation runs");

  const runCreate = run
    .command("create")
    .description("Create a run (DRAFT state)")
    .option("--body <json>", "Run config JSON (string, .json file, or '-' for stdin)")
    .option("--name <name>", "Run name (REQUIRED)")
    .addOption(
      enumOption(
        "--source-mode <mode>",
        "Where the conversations come from (REQUIRED)",
        CONVERSATION_EVAL_RUN_CREATE__BODY_SOURCE_MODE
      )
    )
    .option("--target-deployment-id <id>", "Target deployment (SIMULATED — required to execute)")
    .option("--target-agent-id <id>", "Target agent (SIMULATED)")
    .option("--source-chat-id <id>", "Source inbox chat (INBOX)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run create --name "Refund flow" --source-mode SIMULATED --target-agent-id 55555555-5555-4555-8555-555555555555 --target-deployment-id 99999999-9999-4999-8999-999999999999 --body '{"testerConfig":{"templateId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},"judgeConfigs":[{"templateId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","kRepetitions":3}],"summaryConfig":{"templateId":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}}'
  $ nexus agent-eval run create --name "Inbox spot check" --source-mode INBOX --source-chat-id aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa --body '{"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}'
  $ nexus agent-eval run create --body run.json

Notes:
  THE FLAGS ALONE CANNOT CREATE A RUN. judgeConfigs (at least one) and
  summaryConfig are REQUIRED and have no flags, so every create carries a --body.
  name and sourceMode are required too, from either place.
  Each judge config needs EITHER a templateId or all four of criterion,
  resolvedRubric, provider and model. summaryConfig needs a templateId or all of
  resolvedPrompt, provider and model. testerConfig (SIMULATED) needs a templateId
  or an inline resolvedSystemPrompt.
  JUDGE CRITERIA MUST BE DISTINCT — two configs on the same criterion is refused.
  SET kRepetitions ODD AND AT LEAST 3, so repeated judge passes can tie-break. The
  contract allows 1 to 20; 1 gives you a single opinion with no agreement signal.
  FOR --source-mode SIMULATED PASS BOTH IDS. Agent-id alone creates a DRAFT that
  looks fine and then fails at execute: the tester talks to the DEPLOYMENT, and a
  missing one surfaces as "Target deployment … is inactive or has no agent".
  --source-mode INBOX needs a chat with usable turns. An empty one fails with
  "has no usable turns to judge".
  Defaults applied at create: maxTurns 20, runTimeoutMs 600000,
  targetVersionMode PRODUCTION. Costs and caps are USD × 10,000.
  A baselineRunId must have been judged on the SAME criteria, or the create is
  refused before any spend.
  Config is FROZEN into the run: editing a template afterwards does not change it.

  A COMPLETE run.json, INLINE — no template UUIDs, so it runs as written once you
  substitute the two ids. This is the file the "--body run.json" example above
  wants, and it satisfies every rule in these notes: two DISTINCT criteria, all
  four inline judge fields on each, kRepetitions odd and at least 3, a
  summaryConfig with its three inline fields, and a testerConfig because the mode
  is SIMULATED.

    {
      "name": "Refund flow",
      "sourceMode": "SIMULATED",
      "targetAgentId": "11111111-1111-4111-8111-111111111111",
      "targetDeploymentId": "22222222-2222-4222-8222-222222222222",
      "testerConfig": {
        "resolvedSystemPrompt": "You are a customer who was double-charged and wants a refund. Stay in character."
      },
      "judgeConfigs": [
        {
          "criterion": "helpfulness",
          "resolvedRubric": "Score 1-5. 5 = the refund path was stated plainly and completely.",
          "provider": "OPEN_AI",
          "model": "gpt-4o",
          "kRepetitions": 3
        },
        {
          "criterion": "tone",
          "resolvedRubric": "Score 1-5. 5 = calm and non-defensive throughout.",
          "provider": "OPEN_AI",
          "model": "gpt-4o",
          "kRepetitions": 3
        }
      ],
      "summaryConfig": {
        "resolvedPrompt": "Summarize how the agent handled the refund request, in three bullets.",
        "provider": "OPEN_AI",
        "model": "gpt-4o"
      }
    }

  Swap "sourceMode" to "INBOX" and you drop testerConfig, targetAgentId and
  targetDeploymentId, and add "sourceChatId" instead. Add "thresholdConfig" if
  you want run.verdict written — without one it stays null on a healthy run.
  CREATING IT SPENDS NOTHING; "run execute" is what queues the work.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          sourceMode: opts.sourceMode,
          targetDeploymentId: opts.targetDeploymentId,
          targetAgentId: opts.targetAgentId,
          sourceChatId: opts.sourceChatId
        });
        emit(await client.agentEvals.runs.create(asRequestBody<CreateAgentEvalRunBody>(body)));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const runList = addPaginationOptions(
    run
      .command("list")
      .description("List runs")
      .option("--agent-id <id>", "Filter by target agent")
      .addOption(
        enumOption(
          "--status <status>",
          "Filter by run status",
          CONVERSATION_EVAL_RUN_LIST__PARAMS_STATUS
        )
      )
      .addOption(
        enumOption(
          "--source-mode <mode>",
          "Filter by source mode",
          CONVERSATION_EVAL_RUN_LIST__PARAMS_SOURCE_MODE
        )
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent-eval run list
  $ nexus agent-eval run list --agent-id 55555555-5555-4555-8555-555555555555 --status COMPLETED
  $ nexus agent-eval run list --source-mode SIMULATED --limit 5

Notes:
  --status takes ONE of twelve run states, and the middle ones are the pipeline
  stages: DRAFT, QUEUED, INGESTING, SIMULATING, SIMULATED, JUDGING, SUMMARIZING,
  COMPLETED, FAILED, TIMED_OUT, BUDGET_EXCEEDED, ABORTED. A run stuck mid-pipeline
  is not COMPLETED and not FAILED, so a two-state poll never terminates.
  --page defaults to 1 and --limit to 20; above 100 is a 400.
  Output is raw JSON from the API — this namespace has no table rendering.
  Every row carries its frozen configs and its costs in USD × 10,000.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      emit(
        await client.agentEvals.runs.list({
          ...getPaginationParams(opts),
          agentId: opts.agentId,
          status: opts.status,
          sourceMode: opts.sourceMode
        })
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  run
    .command("get")
    .description("Get a run")
    .argument("<run-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run get 11111111-1111-4111-8111-111111111111

Notes:
  The poll target for a queued run: read status until it reaches COMPLETED,
  FAILED, TIMED_OUT, BUDGET_EXCEEDED or ABORTED.
  terminationReason says WHY a run stopped — TESTER_END_SIGNAL, MAX_TURNS,
  RUN_TIMEOUT, BUDGET_CAP, EMULATOR_FAILED, INBOX_INGESTED or ABORTED. A run that
  hit MAX_TURNS or BUDGET_CAP still reports COMPLETED, so the score describes a
  conversation that was cut short.
  verdict is null here and always will be; read summaryText and "run results".
  Costs are USD × 10,000, split across tester / judge / summary.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.runs.get(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(run.command("delete"))
    .description("Delete a run")
    .argument("<run-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run delete 11111111-1111-4111-8111-111111111111
  $ nexus agent-eval run delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  IT TAKES THE TRANSCRIPT AND THE SCORES WITH IT. Every turn of the conversation,
  every judge verdict and the summary go in one call, and there is no undo and no
  export. Run "run transcript" and "run results" first if any of it matters.
  A run used as another run's baseline should not be deleted: the comparison has
  nothing left to read.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete run ${id}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        await client.agentEvals.runs.delete(id);
        printSuccess(`Deleted run ${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  run
    .command("execute")
    .description("Enqueue a DRAFT run → QUEUED")
    .argument("<run-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run execute 11111111-1111-4111-8111-111111111111

Notes:
  IT ONLY ENQUEUES. The call returns as soon as the run is QUEUED — the
  conversation, the judging and the summary all happen in a worker afterwards, so
  a 200 here says nothing about the outcome. Poll "run get".
  IT SPENDS MONEY on every turn and every judge repetition. Cap it before you run
  it with budgetCapUsdTenThousandths (USD × 10,000) on the run.
  ONLY A DRAFT CAN BE EXECUTED — a run already queued or finished is refused,
  naming the state it is in, so this is not a retry.
  A SIMULATED TURN THAT CALLS A LONG WORKFLOW TOOL CAN DIE QUIETLY: the symptom is
  a run with no errorMessage, near-zero cost and turn 0 only. Check
  "run transcript" for how far it actually got.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.runs.execute(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  run
    .command("abort")
    .description("Abort an in-progress run → ABORTED")
    .argument("<run-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run abort 11111111-1111-4111-8111-111111111111

Notes:
  Stops a run in flight and records terminationReason ABORTED. It does NOT refund
  the tokens already spent, and it does not delete the partial transcript — which
  is worth reading to see where the run went wrong.
  An aborted run is never scored: there is no summaryText and no verdict.
  Only a run in flight can be aborted; one that has finished is refused.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.runs.abort(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  run
    .command("transcript")
    .description("Get transcript turns")
    .argument("<run-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run transcript 11111111-1111-4111-8111-111111111111

Notes:
  The conversation the judges scored, turn by turn, with each role: TESTER and
  TARGET for a SIMULATED run, USER and AGENT for an ingested INBOX one, SYSTEM for
  either.
  A TRANSCRIPT OF ONE TURN, OR NONE, IS THE FAILURE SIGNAL for a run that reports
  no error — it means the target never answered, usually a slow tool call.
  Available while a run is still going, so it is the way to watch progress.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emitList(await client.agentEvals.runs.transcript(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  run
    .command("results")
    .description("Get scores, rollups, verdict, cost")
    .argument("<run-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run results 11111111-1111-4111-8111-111111111111

Notes:
  Answers {run, judgeResults, rollups, baselineDiffs}. rollups is the per-criterion
  aggregate across repetitions — the number to report; judgeResults is every
  individual pass behind it.
  THE WRITTEN VERDICT IS run.summaryText, IN MARKDOWN. run.verdict is ALWAYS null:
  nothing in the platform writes that column, so treating null as "inconclusive"
  reads a fact that was never recorded.
  COST IS run.totalCostUsdTenThousandths — USD × 10,000. Divide by 10000 before
  displaying. The same unit applies to the tester / judge / summary splits.
  A JUDGE PASS CAN COME BACK MALFORMED. Those repetitions are marked rather than
  dropped, so check the judge statuses before trusting a rollup built from few
  usable passes.
  baselineDiffs is empty unless the run was created with a baselineRunId; a
  regressed flag there is per criterion.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.runs.results(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  run
    .command("compare")
    .description("Compare a run vs a baseline run")
    .argument("<run-id>")
    .requiredOption("--baseline <baseline-run-id>", "Baseline run ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval run compare 11111111-1111-4111-8111-111111111111 --baseline 22222222-2222-4222-8222-222222222222

Notes:
  Both runs must have been judged on the SAME criteria — a comparison across
  different rubrics is refused rather than reported as a delta of nothing.
  Per criterion you get currentScore, baselineScore, delta and a regressed flag.
  A null score on either side means that criterion was never scored there, so its
  delta is null too — not zero.
  This is a READ, and works on any two finished runs; you do not have to have set
  baselineRunId at create time.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emitList(await client.agentEvals.runs.compare(id, opts.baseline));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Batches
  // ─────────────────────────────────────────────────────────────────────────
  const batch = root.command("batch").description("Manage batch evaluations");

  const batchCreate = batch
    .command("create")
    .description("Create + enqueue a batch over a conversation filter")
    .requiredOption("--body <json>", "Batch config JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval batch create --body '{"name":"Weekly sample","filterJson":{"agentId":"55555555-5555-4555-8555-555555555555","dateRange":{"from":"2026-08-01","to":"2026-08-07"}},"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}'
  $ nexus agent-eval batch create --body batch.json

Notes:
  CREATE AND ENQUEUE ARE ONE STEP HERE — unlike a run, there is no DRAFT to inspect
  first. It starts spending as soon as this returns, one child run per matched
  conversation, so CHECK THE FILTER FIRST with "nexus conversation list".
  A BATCH CANNOT USE TEMPLATE IDS. judgeConfigs and summaryConfig must be complete
  inline snapshots — criterion, resolvedRubric, provider, model and kRepetitions on
  every judge; resolvedPrompt, provider and model on the summary. Only "run create"
  resolves a templateId for you.
  name, filterJson, at least one judgeConfig and summaryConfig are all REQUIRED.
  budgetCapUsdTenThousandths caps the WHOLE batch, in USD × 10,000. Set it: the
  cost scales with however many conversations the filter matched.
  Status PARTIAL means some child runs failed — read them with "run list".`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.batches.create(
            asRequestBody<CreateAgentEvalBatchBody>(await resolveRequiredBody(opts.body))
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const batchList = addPaginationOptions(
    batch
      .command("list")
      .description("List batches")
      .addOption(
        enumOption(
          "--status <status>",
          "Filter by batch status",
          CONVERSATION_EVAL_BATCH_LIST__PARAMS_STATUS
        )
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent-eval batch list
  $ nexus agent-eval batch list --status PARTIAL --limit 5

Notes:
  --status takes QUEUED, RUNNING, COMPLETED, PARTIAL or FAILED. PARTIAL is the one
  to watch: the batch finished with some child runs failed, and it is NOT reported
  as FAILED.
  --page defaults to 1 and --limit to 20.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      emit(
        await client.agentEvals.batches.list({
          ...getPaginationParams(opts),
          status: opts.status
        })
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  batch
    .command("get")
    .description("Get a batch + aggregate scorecard")
    .argument("<batch-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval batch get 33333333-3333-4333-8333-333333333333

Notes:
  Carries the batch plus the aggregate scorecard across its child runs. The
  per-conversation detail lives on the runs themselves — list them with
  "nexus agent-eval run list" and read each with "run results".
  AN AGGREGATE OVER FEW COMPLETED CHILDREN IS STILL REPORTED. On a PARTIAL batch
  the scorecard describes only the runs that finished, and nothing in the number
  says how many did not.
  There is no batch abort: cancel the work by aborting the child runs.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.batches.get(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Templates
  // ─────────────────────────────────────────────────────────────────────────
  const template = root.command("template").description("Manage tester/judge/summary templates");

  template.addHelpText(
    "after",
    `
A template is the reusable half of a run's config: a TESTER_PERSONA (who the
simulated user is), a JUDGE_RUBRIC (how a criterion is scored) or a SUMMARY_PROMPT
(how the verdict is written). Its text always lives in systemPrompt, whichever kind
it is.

Two facts about ownership:
  • A GLOBAL SEED IS IMMUTABLE. Update or delete answers 403, and attach is refused
    outright — "template clone" it into an agent-owned copy and edit that.
  • THE FIELD IS agentId GOING IN AND ownerAgentId COMING BACK. Reading a template
    and POSTing it back verbatim fails validation for a missing agentId.`
  );

  const templateList = addPaginationOptions(
    template
      .command("list")
      .description("List templates (GLOBAL seeds ∪ agent-attached)")
      .option("--agent-id <id>", "Scope to GLOBAL ∪ templates attached to this agent")
      .addOption(
        enumOption(
          "--kind <kind>",
          "Filter by template kind",
          CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_KIND
        )
      )
      .addOption(
        enumOption(
          "--scope <scope>",
          "Filter by ownership scope",
          CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_SCOPE
        )
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent-eval template list
  $ nexus agent-eval template list --agent-id 55555555-5555-4555-8555-555555555555 --kind JUDGE_RUBRIC
  $ nexus agent-eval template list --scope GLOBAL

Notes:
  --agent-id scopes to GLOBAL seeds PLUS what is attached to that agent — it does
  not narrow to that agent alone. Add --scope AGENT for the agent-owned ones.
  isSeed distinguishes an immutable GLOBAL seed from an editable copy; clonedFromId
  says which seed a copy came from.
  Templates ATTACHED to other agents do not appear here — use
  "template importable --agent-id <id>" to find those.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      emit(
        await client.agentEvals.templates.list({
          ...getPaginationParams(opts),
          agentId: opts.agentId,
          kind: opts.kind,
          scope: opts.scope
        })
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  const templateImportable = addPaginationOptions(
    template
      .command("importable")
      .description("List templates importable onto an agent")
      .requiredOption("--agent-id <id>", "Agent the picker is relative to")
      .addOption(
        enumOption(
          "--kind <kind>",
          "Filter by template kind",
          CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE__PARAMS_KIND
        )
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent-eval template importable --agent-id 55555555-5555-4555-8555-555555555555
  $ nexus agent-eval template importable --agent-id 55555555-5555-4555-8555-555555555555 --kind TESTER_PERSONA

Notes:
  Other agents' templates that this agent could import, with the ones already
  attached excluded — so an empty list means "nothing left to import", not
  "nothing exists".
  --agent-id is REQUIRED: the whole answer is relative to one agent.
  Import an entry with "template attach", which shares the SAME row — later edits
  by the owner are seen by every agent it is attached to. Use "template clone" for
  an independent copy.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      emit(
        await client.agentEvals.templates.listImportable({
          ...getPaginationParams(opts),
          agentId: opts.agentId,
          kind: opts.kind
        })
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  template
    .command("get")
    .description("Get a template")
    .argument("<template-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template get 44444444-4444-4444-8444-444444444444

Notes:
  The prompt text is systemPrompt for all three kinds.
  ownerAgentId IS THE READ-SIDE NAME of what create takes as agentId — do not send
  it back. scope GLOBAL with isSeed true means immutable.
  version increments on each update; criterion (JUDGE_RUBRIC), goal and endSignal
  (TESTER_PERSONA) are absent rather than null when the kind does not use them.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.templates.get(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const templateCreate = template
    .command("create")
    .description("Create an agent-scoped template")
    .requiredOption("--body <json>", "Template JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template create --body '{"agentId":"55555555-5555-4555-8555-555555555555","kind":"TESTER_PERSONA","name":"Impatient shopper","systemPrompt":"You are a hurried customer…","endSignal":"DONE"}'
  $ nexus agent-eval template create --body '{"agentId":"55555555-5555-4555-8555-555555555555","kind":"JUDGE_RUBRIC","name":"Helpfulness","criterion":"helpfulness","systemPrompt":"Score 1-5 where…"}'
  $ nexus agent-eval template create --body template.json

Notes:
  THE BODY NEEDS agentId — the owning agent, and a UUID. A template GET returns the
  owner as ownerAgentId, so echoing a fetched template back fails validation.
  Also REQUIRED: kind (TESTER_PERSONA, JUDGE_RUBRIC or SUMMARY_PROMPT), name, and
  systemPrompt with at least one character.
  THE PROMPT FIELD IS systemPrompt FOR EVERY KIND — a judge rubric and a summary
  prompt use the same field name as a tester persona. There is no "rubric" or
  "prompt" key.
  criterion belongs on a JUDGE_RUBRIC and is what "run create" matches when it
  enforces distinct criteria. goal, endSignal and endConversationSchema belong on a
  TESTER_PERSONA.
  Anything created here is AGENT scope, never GLOBAL. defaultProvider /
  defaultModel are hints a run may override.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.templates.create(
            asRequestBody<CreateAgentEvalTemplateBody>(await resolveRequiredBody(opts.body))
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  template
    .command("update")
    .description("Update an agent template (GLOBAL → 403)")
    .argument("<template-id>")
    .requiredOption("--body <json>", "Partial template JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template update 44444444-4444-4444-8444-444444444444 --body '{"systemPrompt":"Revised rubric…"}'
  $ nexus agent-eval template update 44444444-4444-4444-8444-444444444444 --body '{"endConversationSchema":null}'

Notes:
  A GLOBAL SEED IS IMMUTABLE — 403. Clone it first, then update the clone.
  Partial: send only what changes. agentId and kind are NOT updatable here.
  null CLEARS, MISSING LEAVES ALONE, and only for endConversationSchema and
  outputJsonSchema: sending null writes SQL NULL, omitting the key changes nothing.
  Every other field ignores null.
  EDITS ARE SEEN BY EVERY AGENT THIS TEMPLATE IS ATTACHED TO — attach shares the
  row rather than copying it. Runs already created are unaffected: their config was
  frozen at create.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.templates.update(
            id,
            asRequestBody<UpdateAgentEvalTemplateBody>(await resolveRequiredBody(opts.body))
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(template.command("delete"))
    .description("Delete an agent template (GLOBAL → 403)")
    .argument("<template-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template delete 44444444-4444-4444-8444-444444444444
  $ nexus agent-eval template delete 44444444-4444-4444-8444-444444444444 --yes

Notes:
  A GLOBAL seed cannot be deleted (403).
  IT REMOVES THE TEMPLATE FROM EVERY AGENT IT WAS ATTACHED TO, since they all share
  the one row. Detach first if you only meant to remove it from one.
  THE RUBRIC AND THE PROMPTS GO WITH IT and are not recoverable. "template get
  <id> --json" is the only export.
  Runs already created keep working: their config is a frozen snapshot.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete template ${id}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        await client.agentEvals.templates.delete(id);
        printSuccess(`Deleted template ${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  template
    .command("clone")
    .description("Clone a template into an editable agent-owned copy")
    .argument("<template-id>")
    .requiredOption("--agent-id <id>", "Agent that will own the clone")
    .option("--name <name>", "Name for the clone")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template clone eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee --agent-id 55555555-5555-4555-8555-555555555555
  $ nexus agent-eval template clone eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee --agent-id 55555555-5555-4555-8555-555555555555 --name "Helpfulness, strict"

Notes:
  THE ONLY WAY TO EDIT A GLOBAL SEED: clone it, then update the copy. The clone is
  AGENT scope, owned by --agent-id, and records clonedFromId.
  CLONE vs ATTACH: a clone is INDEPENDENT — later edits to the original do not reach
  it, and its own edits reach nobody. attach shares one row across agents.
  The clone gets a new id, so update any run config that named the original.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.templates.clone(id, {
            agentId: opts.agentId,
            ...(opts.name ? { name: opts.name } : {})
          })
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  template
    .command("attach")
    .description("Attach (import) an existing template onto an agent")
    .argument("<template-id>")
    .requiredOption("--agent-id <id>", "Agent to attach the template to")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template attach 44444444-4444-4444-8444-444444444444 --agent-id 55555555-5555-4555-8555-555555555555

Notes:
  ATTACH SHARES THE ROW, IT DOES NOT COPY IT. The owning agent's later edits apply
  to every agent it is attached to, and deleting it removes it from all of them. Use
  "template clone" when you want an independent copy.
  A GLOBAL SEED CANNOT BE ATTACHED — it has no editable identity to share, so this
  is refused and the message says to clone it.
  Find what an agent can attach with "template importable --agent-id <id>".`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.templates.attach(id, { agentId: opts.agentId }));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(template.command("detach"))
    .description("Detach a template from an agent")
    .argument("<template-id>")
    .argument("<agent-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template detach 44444444-4444-4444-8444-444444444444 55555555-5555-4555-8555-555555555555
  $ nexus agent-eval template detach 44444444-4444-4444-8444-444444444444 55555555-5555-4555-8555-555555555555 --yes

Notes:
  Takes the template away from ONE agent and leaves it intact for the others —
  the opposite of "template delete".
  THE AGENT STOPS BEING EVALUATED BY IT, and any trigger or schedule that names
  this pair stops producing scores. Re-attach with "template attach".
  THE OWNER'S OWN LINK CANNOT BE DETACHED: that link is structural, so removing the
  owner's access means deleting the template. Refused with a message saying so.
  A run whose config already names this template is unaffected — configs are frozen
  at create.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, agentId: string, opts) => {
      try {
        if (!(await confirmDestructive(`Detach template ${id} from agent ${agentId}?`, opts)))
          return;
        const client = createClient(program.optsWithGlobals());
        await client.agentEvals.templates.detach(id, agentId);
        printSuccess(`Detached template ${id} from agent ${agentId}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Schedules
  // ─────────────────────────────────────────────────────────────────────────
  const schedule = root.command("schedule").description("Manage recurring (cron) evaluations");

  const scheduleCreate = schedule
    .command("create")
    .description("Create a cron schedule")
    .requiredOption("--body <json>", "Schedule JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval schedule create --body '{"sourceMode":"SIMULATED","cronExpression":"0 9 * * 1","timezone":"Europe/Brussels","runConfig":{"name":"Weekly refund check","targetAgentId":"55555555-5555-4555-8555-555555555555","targetDeploymentId":"99999999-9999-4999-8999-999999999999","testerConfig":{"resolvedSystemPrompt":"You are a hurried customer…","endSignal":"DONE"},"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}}'
  $ nexus agent-eval schedule create --body schedule.json

Notes:
  IT CREATES A RECURRING SPEND. Every tick creates AND executes a run, so the cost
  repeats until you pause or delete the schedule. Put a
  budgetCapUsdTenThousandths inside runConfig.
  REQUIRED: sourceMode, cronExpression and runConfig.
  runConfig MUST BE FULLY RESOLVED — NO templateId. The tick materializes the run
  directly, so every judge needs criterion, resolvedRubric, provider, model and
  kRepetitions inline, the summary needs resolvedPrompt, provider and model, and a
  tester needs resolvedSystemPrompt and endSignal. A templateId is accepted by the
  parse and then supplies nothing.
  sourceMode belongs on the SCHEDULE, not inside runConfig; a copy nested there is
  stripped without comment. runConfig.name is optional — each tick names its own run.
  timezone decides when the cron fires; omit it and you inherit the platform default
  rather than yours. Standard 5-field cron.
  It starts ACTIVE, so the next matching tick fires. There is no "run once now" —
  use "run create" + "run execute" for that.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.schedules.create(
            asRequestBody<CreateAgentEvalScheduleBody>(await resolveRequiredBody(opts.body))
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const scheduleList = addPaginationOptions(
    schedule
      .command("list")
      .description("List schedules")
      .addOption(
        enumOption(
          "--status <status>",
          "Filter by schedule status",
          CONVERSATION_EVAL_SCHEDULE_LIST__PARAMS_STATUS
        )
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus agent-eval schedule list
  $ nexus agent-eval schedule list --status ACTIVE

Notes:
  --status ACTIVE is the read that answers "what is still spending money on a
  timer". PAUSED schedules keep their config and fire nothing.
  nextRunAt is when each one fires next, lastRunId / lastRunAt what it produced
  last — a nextRunAt in the past on an ACTIVE row means the tick is not being
  scheduled and the run is not coming.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      emit(
        await client.agentEvals.schedules.list({
          ...getPaginationParams(opts),
          status: opts.status
        })
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  const scheduleUpdateCmd = schedule
    .command("update")
    .description("Update a schedule")
    .argument("<schedule-id>")
    .requiredOption("--body <json>", "Partial schedule JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval schedule update 66666666-6666-4666-8666-666666666666 --body '{"cronExpression":"0 6 * * *"}'
  $ nexus agent-eval schedule update 66666666-6666-4666-8666-666666666666 --body '{"status":"PAUSED"}'

Notes:
  Writable: status (ACTIVE | PAUSED), cronExpression, timezone and runConfig.
  sourceMode is NOT changeable — create a new schedule instead.
  A runConfig sent here REPLACES the recipe wholesale and is held to the same
  fully-resolved rule as create: no templateId, every judge complete.
  "schedule pause" / "schedule resume" are the same thing as setting status, and
  are the ones to use in a script.
  Changing the cron does not re-run anything that was missed while it was paused.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.schedules.update(
            id,
            asRequestBody<UpdateAgentEvalScheduleBody>(await resolveRequiredBody(opts.body))
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(schedule.command("delete"))
    .description("Delete a schedule")
    .argument("<schedule-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval schedule delete 66666666-6666-4666-8666-666666666666
  $ nexus agent-eval schedule delete 66666666-6666-4666-8666-666666666666 --yes

Notes:
  THE RECIPE GOES WITH THE TIMER. The whole runConfig — tester, judges, summary —
  lives on the schedule row and there is no undo, so recurring evaluation stops
  and rebuilding it means writing the config again.
  The runs it already produced SURVIVE; only the timer and its recipe go.
  If you might want the recipe back, "schedule pause" keeps it and stops the
  spending just as effectively.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete schedule ${id}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        await client.agentEvals.schedules.delete(id);
        printSuccess(`Deleted schedule ${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  schedule
    .command("pause")
    .description("Pause a schedule")
    .argument("<schedule-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval schedule pause 66666666-6666-4666-8666-666666666666

Notes:
  THE WAY TO STOP RECURRING SPEND without losing the recipe. Status becomes PAUSED
  and no further ticks fire.
  A run already in flight keeps going — abort it with "run abort" if that matters.
  Nothing accumulates while paused: resuming does not replay missed ticks.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.schedules.pause(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  schedule
    .command("resume")
    .description("Resume a schedule")
    .argument("<schedule-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval schedule resume 66666666-6666-4666-8666-666666666666

Notes:
  Back to ACTIVE, firing from the NEXT matching cron time — missed ticks are not
  replayed, so resuming costs nothing until then.
  Check nextRunAt in "schedule list" afterwards: an ACTIVE row with no nextRunAt is
  a schedule that will not fire.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.schedules.resume(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Triggers (opt-in automation; enabled=false by default)
  // ─────────────────────────────────────────────────────────────────────────
  const trigger = root.command("trigger").description("Manage opt-in automation triggers");

  const triggerUpsert = trigger
    .command("upsert")
    .description("Upsert a trigger config (AUTO_ON_CLOSE | SCHEDULED_SAMPLE)")
    .requiredOption("--body <json>", "Trigger JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval trigger upsert --body '{"kind":"AUTO_ON_CLOSE","agentId":"55555555-5555-4555-8555-555555555555","enabled":true,"sampleRate":0.1,"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}'
  $ nexus agent-eval trigger upsert --body trigger.json

Notes:
  THIS IS THE UNBOUNDED ONE. AUTO_ON_CLOSE evaluates conversations as they close, so
  the spend follows your traffic with no ceiling of its own. Set sampleRate (0 to 1)
  and budgetCapUsdTenThousandths (USD × 10,000) in the same call, not later.
  enabled DEFAULTS TO FALSE, which is why a trigger can look configured and never
  fire. Send enabled: true when you actually want it live.
  UPSERT, NOT CREATE: the same agent/deployment/kind combination REPLACES the
  existing config rather than adding a second one. Read the current one with
  "trigger list" before overwriting.
  REQUIRED: kind, at least one judgeConfig and summaryConfig — and, as with a batch,
  they must be COMPLETE INLINE SNAPSHOTS. A templateId supplies nothing here.
  Scope it with agentId and/or deploymentId; both absent means every conversation in
  the organization.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.triggers.upsert(
            asRequestBody<UpsertAgentEvalTriggerBody>(await resolveRequiredBody(opts.body))
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  const triggerList = trigger
    .command("list")
    .description("List triggers")
    .option("--agent-id <id>", "Filter by agent")
    .option("--deployment-id <id>", "Filter by deployment")
    .addOption(
      enumOption(
        "--kind <kind>",
        "Filter by trigger kind",
        CONVERSATION_EVAL_TRIGGER_LIST__PARAMS_KIND
      )
    )
    .option("--enabled-only", "Only enabled triggers")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval trigger list
  $ nexus agent-eval trigger list --enabled-only
  $ nexus agent-eval trigger list --agent-id 55555555-5555-4555-8555-555555555555 --kind AUTO_ON_CLOSE

Notes:
  "trigger list --enabled-only" IS THE AUDIT: it names every automation currently
  spending money on your traffic. Run it before wondering where eval cost came from.
  Without --enabled-only you see disabled configs too, which is what an upsert
  leaves behind when enabled was omitted.
  Read the id from here for "trigger delete", and read the whole row before an
  upsert — an upsert replaces the matching config outright.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emitList(
          await client.agentEvals.triggers.list({
            agentId: opts.agentId,
            deploymentId: opts.deploymentId,
            kind: opts.kind,
            // Only ever sent when the flag is present. `false` would narrow the
            // listing to nothing rather than leaving it unfiltered, which is what
            // the absent flag has always meant here.
            enabledOnly: opts.enabledOnly ? true : undefined
          })
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(trigger.command("delete"))
    .description("Delete a trigger")
    .argument("<trigger-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval trigger delete 77777777-7777-4777-8777-777777777777
  $ nexus agent-eval trigger delete 77777777-7777-4777-8777-777777777777 --yes

Notes:
  THIS IS THE HARD STOP FOR AUTOMATIC EVALUATION, and it is silent: conversations
  keep arriving and simply stop being scored, with nothing reporting the gap. Its
  sampling rate and template pins go with the row.
  To stop it reversibly, upsert the same config with enabled: false instead.
  Runs the trigger already created survive; only the automation goes.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete trigger ${id}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        await client.agentEvals.triggers.delete(id);
        printSuccess(`Deleted trigger ${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Webhooks
  // ─────────────────────────────────────────────────────────────────────────
  const webhook = root.command("webhook").description("Manage run/batch webhooks");

  const webhookUpsert = webhook
    .command("upsert")
    .description("Upsert a webhook config")
    .requiredOption("--body <json>", "Webhook JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval webhook upsert --body '{"url":"https://hooks.example.com/nexus-evals","events":["run.completed","run.failed"],"secret":"<signing-secret>"}'
  $ nexus agent-eval webhook upsert --body webhook.json

Notes:
  events IS REQUIRED and takes at least one of exactly three values:
  "run.completed", "run.failed", "batch.completed". Anything else is a 400.
  THE URL MUST BE PUBLICLY REACHABLE http(s). localhost, a private or link-local
  address and an internal hostname are all refused by an SSRF guard, so a webhook
  cannot be pointed at your own network for testing.
  TO WRITE THE RECEIVER: delivery is a POST of the JSON body, and when a secret
  is set it is signed HMAC-SHA256 over that body, sent as
  "X-Nexus-Signature: sha256=<hex>". Set NO secret and the POST arrives unsigned
  with no header at all — there is nothing to verify and anyone who learns the
  URL can forge a completion.
  secret is write-only: "webhook get" REDACTS it, so store it when you set it —
  you cannot read it back to verify a signature later.
  Attach a webhook to a run by passing its id as webhookConfigId on "run create",
  a batch or a schedule. Upserting one does not, by itself, notify anything.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(
          await client.agentEvals.webhooks.upsert(
            asRequestBody<UpsertAgentEvalWebhookBody>(await resolveRequiredBody(opts.body))
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  webhook
    .command("get")
    .description("Get a webhook (secret redacted)")
    .argument("<webhook-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval webhook get 88888888-8888-4888-8888-888888888888

Notes:
  THE SECRET IS REDACTED HERE and there is no read-back anywhere: if you have lost
  it, upsert a new one rather than hunting for it.
  isActive false means the config exists and nothing is delivered.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        emit(await client.agentEvals.webhooks.get(id));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  confirmable(webhook.command("delete"))
    .description("Delete a webhook")
    .argument("<webhook-id>")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval webhook delete 88888888-8888-4888-8888-888888888888
  $ nexus agent-eval webhook delete 88888888-8888-4888-8888-888888888888 --yes

Notes:
  RUNS, BATCHES AND SCHEDULES STILL NAMING IT KEEP RUNNING and simply stop
  notifying, so this is a silent way to lose eval alerts. Check what points at it
  before deleting.
  THE SIGNING SECRET GOES WITH THE ROW and is redacted everywhere, so recreating
  this webhook means issuing a new secret and updating the receiver.
  To stop delivery reversibly, upsert the same webhook with isActive: false.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        if (!(await confirmDestructive(`Delete webhook ${id}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        await client.agentEvals.webhooks.delete(id);
        printSuccess(`Deleted webhook ${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose, so the
  // generated contract reference lands BELOW the Examples and Notes — see
  // `bindCommand`. `contract-help.test.ts` asserts that ordering.
  bindCommand(runCreate, CONVERSATION_EVAL_RUN_CREATE_CONTRACT, {
    // `run create` is a --body command with a handful of convenience flags. The
    // three enums below sit inside judgeConfigs / summaryConfig / the version
    // pin, which are nested objects and arrays with no flag shape, so they are
    // reachable only through --body. Naming them here is what stops the gate
    // reading "somebody forgot to expose this".
    "Body.targetVersionMode": "--body only; pins the agent version a SIMULATED run targets",
    "Body.judgeConfigs[].provider": "--body only; judgeConfigs is an array of objects",
    "Body.summaryConfig.provider": "--body only; summaryConfig is a nested object"
  });
  bindCommand(runList, CONVERSATION_EVAL_RUN_LIST_CONTRACT);
  bindCommand(batchList, CONVERSATION_EVAL_BATCH_LIST_CONTRACT);
  bindCommand(templateList, CONVERSATION_EVAL_TEMPLATE_LIST_CONTRACT);
  bindCommand(templateImportable, CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE_CONTRACT);
  bindCommand(scheduleList, CONVERSATION_EVAL_SCHEDULE_LIST_CONTRACT);
  bindCommand(triggerList, CONVERSATION_EVAL_TRIGGER_LIST_CONTRACT);

  // The `--body`-only writers. Every enum these declare lives INSIDE the JSON
  // blob rather than behind a flag, so each one is overridden with where to put
  // it — an unexplained enum here would read as a flag that does not exist.
  bindCommand(batchCreate, CONVERSATION_EVAL_BATCH_CREATE_CONTRACT, {
    "Body.judgeConfigs[].provider": "--body only; judgeConfigs is an array of objects",
    "Body.summaryConfig.provider": "--body only; summaryConfig is a nested object"
  });
  bindCommand(templateCreate, CONVERSATION_EVAL_TEMPLATE_CREATE_CONTRACT, {
    "Body.kind": "--body only; picks which half of the pipeline the template feeds",
    "Body.defaultProvider": "--body only; used when the template is resolved without one"
  });
  bindCommand(scheduleCreate, CONVERSATION_EVAL_SCHEDULE_CREATE_CONTRACT, {
    "Body.sourceMode": "--body only; simulate a conversation, or ingest an inbox chat",
    "Body.runConfig.targetVersionMode": "--body only; runConfig is the frozen run recipe",
    "Body.runConfig.judgeConfigs[].provider":
      "--body only; runConfig.judgeConfigs is an array of objects",
    "Body.runConfig.summaryConfig.provider": "--body only; nested inside runConfig"
  });
  bindCommand(scheduleUpdateCmd, CONVERSATION_EVAL_SCHEDULE_UPDATE_CONTRACT, {
    "Body.status": "--body only; ACTIVE or PAUSED — prefer the pause/resume verbs",
    "Body.runConfig.targetVersionMode": "--body only; runConfig is replaced wholesale",
    "Body.runConfig.judgeConfigs[].provider":
      "--body only; runConfig.judgeConfigs is an array of objects",
    "Body.runConfig.summaryConfig.provider": "--body only; nested inside runConfig"
  });
  bindCommand(triggerUpsert, CONVERSATION_EVAL_TRIGGER_UPSERT_CONTRACT, {
    "Body.kind": "--body only; what causes the trigger to fire"
  });
  bindCommand(webhookUpsert, CONVERSATION_EVAL_WEBHOOK_UPSERT_CONTRACT, {
    "Body.events[]": "--body only; events is an array of strings"
  });
}
