import { HttpClient } from "@agent-nexus/sdk";
import { Command } from "commander";

import { timeoutSecondsToMs } from "../client";
import { resolveApiKey, resolveBaseUrl } from "../config";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { isJsonMode, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  CONVERSATION_EVAL_BATCH_LIST__PARAMS_STATUS,
  CONVERSATION_EVAL_BATCH_LIST_CONTRACT,
  CONVERSATION_EVAL_RUN_CREATE__BODY_SOURCE_MODE,
  CONVERSATION_EVAL_RUN_CREATE_CONTRACT,
  CONVERSATION_EVAL_RUN_LIST__PARAMS_SOURCE_MODE,
  CONVERSATION_EVAL_RUN_LIST__PARAMS_STATUS,
  CONVERSATION_EVAL_RUN_LIST_CONTRACT,
  CONVERSATION_EVAL_SCHEDULE_LIST__PARAMS_STATUS,
  CONVERSATION_EVAL_SCHEDULE_LIST_CONTRACT,
  CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_KIND,
  CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_SCOPE,
  CONVERSATION_EVAL_TEMPLATE_LIST_CONTRACT,
  CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE__PARAMS_KIND,
  CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE_CONTRACT,
  CONVERSATION_EVAL_TRIGGER_LIST__PARAMS_KIND,
  CONVERSATION_EVAL_TRIGGER_LIST_CONTRACT
} from "./agent-eval.contract.generated";

/**
 * `nexus agent-eval` — LLM-as-judge for multi-turn agent conversations.
 *
 * Thin wrapper over the Public API v1 `/agent-evals/*` surface. Every resource
 * (runs, batches, templates, schedules, triggers, webhooks) maps to one HTTP
 * call via the shared {@link HttpClient}; mutating commands take a `--body`
 * JSON blob (string, .json file, or `-` for stdin) plus a few convenience
 * flags. This keeps the command self-contained — no dedicated SDK resource
 * client is required.
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

  // Build an HttpClient from resolved global options.
  const http = () => {
    const globals = program.optsWithGlobals();
    return new HttpClient({
      baseUrl: resolveBaseUrl(globals.baseUrl, globals.profile),
      apiKey: resolveApiKey(globals.apiKey, globals.profile),
      timeout: timeoutSecondsToMs(globals.timeout)
    });
  };

  // Run a request and pretty-print the unwrapped data (record or list).
  const send = async (
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, string> } = {}
  ) => {
    const { data, meta } = await http().requestWithMeta<unknown>(method, path, opts);
    if (Array.isArray(data)) {
      console.log(JSON.stringify({ data, meta }, null, isJsonMode() ? undefined : 2));
    } else {
      console.log(JSON.stringify(meta ? { data, meta } : data, null, isJsonMode() ? undefined : 2));
    }
  };

  // Collect repeatable query pairs (key=value) into an object.
  const queryFrom = (pairs: Record<string, string | undefined>): Record<string, string> => {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(pairs)) if (v !== undefined) q[k] = String(v);
    return q;
  };

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
  $ nexus agent-eval run create --name "Refund flow" --source-mode SIMULATED --target-agent-id <agent-uuid> --target-deployment-id <deployment-uuid> --body '{"testerConfig":{"templateId":"<tester-template-uuid>"},"judgeConfigs":[{"templateId":"<rubric-template-uuid>","kRepetitions":3}],"summaryConfig":{"templateId":"<summary-template-uuid>"}}'
  $ nexus agent-eval run create --name "Inbox spot check" --source-mode INBOX --source-chat-id <chat-uuid> --body '{"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}'
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
  Config is FROZEN into the run: editing a template afterwards does not change it.`
    )
    .action(async (opts) => {
      try {
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          sourceMode: opts.sourceMode,
          targetDeploymentId: opts.targetDeploymentId,
          targetAgentId: opts.targetAgentId,
          sourceChatId: opts.sourceChatId
        });
        await send("POST", "/agent-evals/runs", { body });
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
  $ nexus agent-eval run list --agent-id <agent-uuid> --status COMPLETED
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
      const query = queryFrom({
        ...(getPaginationParams(opts) as Record<string, string>),
        agentId: opts.agentId,
        status: opts.status,
        sourceMode: opts.sourceMode
      });
      await send("GET", "/agent-evals/runs", { query });
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
  $ nexus agent-eval run get <run-uuid>

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
        await send("GET", `/agent-evals/runs/${id}`);
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
  $ nexus agent-eval run delete <run-uuid>
  $ nexus agent-eval run delete <run-uuid> --yes

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
        await http().request("DELETE", `/agent-evals/runs/${id}`);
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
  $ nexus agent-eval run execute <run-uuid>

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
        await send("POST", `/agent-evals/runs/${id}/execute`);
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
  $ nexus agent-eval run abort <run-uuid>

Notes:
  Stops a run in flight and records terminationReason ABORTED. It does NOT refund
  the tokens already spent, and it does not delete the partial transcript — which
  is worth reading to see where the run went wrong.
  An aborted run is never scored: there is no summaryText and no verdict.
  Only a run in flight can be aborted; one that has finished is refused.`
    )
    .action(async (id: string) => {
      try {
        await send("POST", `/agent-evals/runs/${id}/abort`);
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
  $ nexus agent-eval run transcript <run-uuid>

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
        await send("GET", `/agent-evals/runs/${id}/transcript`);
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
  $ nexus agent-eval run results <run-uuid>

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
        await send("GET", `/agent-evals/runs/${id}/results`);
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
  $ nexus agent-eval run compare <run-uuid> --baseline <baseline-run-uuid>

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
        await send("GET", `/agent-evals/runs/${id}/compare`, {
          query: { baselineRunId: opts.baseline }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Batches
  // ─────────────────────────────────────────────────────────────────────────
  const batch = root.command("batch").description("Manage batch evaluations");

  batch
    .command("create")
    .description("Create + enqueue a batch over a conversation filter")
    .requiredOption("--body <json>", "Batch config JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval batch create --body '{"name":"Weekly sample","filterJson":{"agentId":"<agent-uuid>","dateRange":{"from":"2026-08-01","to":"2026-08-07"}},"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}'
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
        await send("POST", "/agent-evals/batches", { body: await resolveBody(opts.body) });
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
      const query = queryFrom({
        ...(getPaginationParams(opts) as Record<string, string>),
        status: opts.status
      });
      await send("GET", "/agent-evals/batches", { query });
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
  $ nexus agent-eval batch get <batch-uuid>

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
        await send("GET", `/agent-evals/batches/${id}`);
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
  $ nexus agent-eval template list --agent-id <agent-uuid> --kind JUDGE_RUBRIC
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
      const query = queryFrom({
        ...(getPaginationParams(opts) as Record<string, string>),
        agentId: opts.agentId,
        kind: opts.kind,
        scope: opts.scope
      });
      await send("GET", "/agent-evals/templates", { query });
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
  $ nexus agent-eval template importable --agent-id <agent-uuid>
  $ nexus agent-eval template importable --agent-id <agent-uuid> --kind TESTER_PERSONA

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
      const query = queryFrom({
        ...(getPaginationParams(opts) as Record<string, string>),
        agentId: opts.agentId,
        kind: opts.kind
      });
      await send("GET", "/agent-evals/templates/importable", { query });
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
  $ nexus agent-eval template get <template-uuid>

Notes:
  The prompt text is systemPrompt for all three kinds.
  ownerAgentId IS THE READ-SIDE NAME of what create takes as agentId — do not send
  it back. scope GLOBAL with isSeed true means immutable.
  version increments on each update; criterion (JUDGE_RUBRIC), goal and endSignal
  (TESTER_PERSONA) are absent rather than null when the kind does not use them.`
    )
    .action(async (id: string) => {
      try {
        await send("GET", `/agent-evals/templates/${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  template
    .command("create")
    .description("Create an agent-scoped template")
    .requiredOption("--body <json>", "Template JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval template create --body '{"agentId":"<agent-uuid>","kind":"TESTER_PERSONA","name":"Impatient shopper","systemPrompt":"You are a hurried customer…","endSignal":"DONE"}'
  $ nexus agent-eval template create --body '{"agentId":"<agent-uuid>","kind":"JUDGE_RUBRIC","name":"Helpfulness","criterion":"helpfulness","systemPrompt":"Score 1-5 where…"}'
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
        await send("POST", "/agent-evals/templates", { body: await resolveBody(opts.body) });
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
  $ nexus agent-eval template update <template-uuid> --body '{"systemPrompt":"Revised rubric…"}'
  $ nexus agent-eval template update <template-uuid> --body '{"endConversationSchema":null}'

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
        await send("PATCH", `/agent-evals/templates/${id}`, { body: await resolveBody(opts.body) });
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
  $ nexus agent-eval template delete <template-uuid>
  $ nexus agent-eval template delete <template-uuid> --yes

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
        await http().request("DELETE", `/agent-evals/templates/${id}`);
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
  $ nexus agent-eval template clone <seed-template-uuid> --agent-id <agent-uuid>
  $ nexus agent-eval template clone <seed-template-uuid> --agent-id <agent-uuid> --name "Helpfulness, strict"

Notes:
  THE ONLY WAY TO EDIT A GLOBAL SEED: clone it, then update the copy. The clone is
  AGENT scope, owned by --agent-id, and records clonedFromId.
  CLONE vs ATTACH: a clone is INDEPENDENT — later edits to the original do not reach
  it, and its own edits reach nobody. attach shares one row across agents.
  The clone gets a new id, so update any run config that named the original.`
    )
    .action(async (id: string, opts) => {
      try {
        await send("POST", `/agent-evals/templates/${id}/clone`, {
          body: { agentId: opts.agentId, ...(opts.name ? { name: opts.name } : {}) }
        });
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
  $ nexus agent-eval template attach <template-uuid> --agent-id <agent-uuid>

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
        await send("POST", `/agent-evals/templates/${id}/attach`, {
          body: { agentId: opts.agentId }
        });
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
  $ nexus agent-eval template detach <template-uuid> <agent-uuid>
  $ nexus agent-eval template detach <template-uuid> <agent-uuid> --yes

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
        await http().request("DELETE", `/agent-evals/templates/${id}/agents/${agentId}`);
        printSuccess(`Detached template ${id} from agent ${agentId}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Schedules
  // ─────────────────────────────────────────────────────────────────────────
  const schedule = root.command("schedule").description("Manage recurring (cron) evaluations");

  schedule
    .command("create")
    .description("Create a cron schedule")
    .requiredOption("--body <json>", "Schedule JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval schedule create --body '{"sourceMode":"SIMULATED","cronExpression":"0 9 * * 1","timezone":"Europe/Brussels","runConfig":{"name":"Weekly refund check","targetAgentId":"<agent-uuid>","targetDeploymentId":"<deployment-uuid>","testerConfig":{"resolvedSystemPrompt":"You are a hurried customer…","endSignal":"DONE"},"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}}'
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
        await send("POST", "/agent-evals/schedules", { body: await resolveBody(opts.body) });
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
      const query = queryFrom({
        ...(getPaginationParams(opts) as Record<string, string>),
        status: opts.status
      });
      await send("GET", "/agent-evals/schedules", { query });
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  schedule
    .command("update")
    .description("Update a schedule")
    .argument("<schedule-id>")
    .requiredOption("--body <json>", "Partial schedule JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval schedule update <schedule-uuid> --body '{"cronExpression":"0 6 * * *"}'
  $ nexus agent-eval schedule update <schedule-uuid> --body '{"status":"PAUSED"}'

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
        await send("PATCH", `/agent-evals/schedules/${id}`, { body: await resolveBody(opts.body) });
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
  $ nexus agent-eval schedule delete <schedule-uuid>
  $ nexus agent-eval schedule delete <schedule-uuid> --yes

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
        await http().request("DELETE", `/agent-evals/schedules/${id}`);
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
  $ nexus agent-eval schedule pause <schedule-uuid>

Notes:
  THE WAY TO STOP RECURRING SPEND without losing the recipe. Status becomes PAUSED
  and no further ticks fire.
  A run already in flight keeps going — abort it with "run abort" if that matters.
  Nothing accumulates while paused: resuming does not replay missed ticks.`
    )
    .action(async (id: string) => {
      try {
        await send("POST", `/agent-evals/schedules/${id}/pause`);
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
  $ nexus agent-eval schedule resume <schedule-uuid>

Notes:
  Back to ACTIVE, firing from the NEXT matching cron time — missed ticks are not
  replayed, so resuming costs nothing until then.
  Check nextRunAt in "schedule list" afterwards: an ACTIVE row with no nextRunAt is
  a schedule that will not fire.`
    )
    .action(async (id: string) => {
      try {
        await send("POST", `/agent-evals/schedules/${id}/resume`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Triggers (opt-in automation; enabled=false by default)
  // ─────────────────────────────────────────────────────────────────────────
  const trigger = root.command("trigger").description("Manage opt-in automation triggers");

  trigger
    .command("upsert")
    .description("Upsert a trigger config (AUTO_ON_CLOSE | SCHEDULED_SAMPLE)")
    .requiredOption("--body <json>", "Trigger JSON (string, .json file, or '-' for stdin)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-eval trigger upsert --body '{"kind":"AUTO_ON_CLOSE","agentId":"<agent-uuid>","enabled":true,"sampleRate":0.1,"judgeConfigs":[{"criterion":"helpfulness","resolvedRubric":"Score 1-5…","provider":"OPEN_AI","model":"gpt-4o","kRepetitions":3}],"summaryConfig":{"resolvedPrompt":"Summarize…","provider":"OPEN_AI","model":"gpt-4o"}}'
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
        await send("PUT", "/agent-evals/triggers", { body: await resolveBody(opts.body) });
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
  $ nexus agent-eval trigger list --agent-id <agent-uuid> --kind AUTO_ON_CLOSE

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
        const query = queryFrom({
          agentId: opts.agentId,
          deploymentId: opts.deploymentId,
          kind: opts.kind,
          enabledOnly: opts.enabledOnly ? "true" : undefined
        });
        await send("GET", "/agent-evals/triggers", { query });
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
  $ nexus agent-eval trigger delete <trigger-uuid>
  $ nexus agent-eval trigger delete <trigger-uuid> --yes

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
        await http().request("DELETE", `/agent-evals/triggers/${id}`);
        printSuccess(`Deleted trigger ${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Webhooks
  // ─────────────────────────────────────────────────────────────────────────
  const webhook = root.command("webhook").description("Manage run/batch webhooks");

  webhook
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
        await send("PUT", "/agent-evals/webhooks", { body: await resolveBody(opts.body) });
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
  $ nexus agent-eval webhook get <webhook-uuid>

Notes:
  THE SECRET IS REDACTED HERE and there is no read-back anywhere: if you have lost
  it, upsert a new one rather than hunting for it.
  isActive false means the config exists and nothing is delivered.`
    )
    .action(async (id: string) => {
      try {
        await send("GET", `/agent-evals/webhooks/${id}`);
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
  $ nexus agent-eval webhook delete <webhook-uuid>
  $ nexus agent-eval webhook delete <webhook-uuid> --yes

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
        await http().request("DELETE", `/agent-evals/webhooks/${id}`);
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
}
