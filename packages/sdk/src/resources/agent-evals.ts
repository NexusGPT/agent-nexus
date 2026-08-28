import type { HttpClient } from "../http-client";
import { AgentEvalBatchesResource } from "./agent-eval-batches";
import { AgentEvalRunsResource } from "./agent-eval-runs";
import { AgentEvalSchedulesResource } from "./agent-eval-schedules";
import { AgentEvalTemplatesResource } from "./agent-eval-templates";
import { AgentEvalTriggersResource } from "./agent-eval-triggers";
import { AgentEvalWebhooksResource } from "./agent-eval-webhooks";
import { BaseResource } from "./base-resource";

/**
 * Agent conversation evaluations — LLM-as-judge scoring of multi-turn agent
 * conversations. Accessed via `client.agentEvals`.
 *
 * This resource holds no methods of its own; it composes the six the domain has,
 * one per entity the `/agent-evals` routes address.
 *
 * ## The shape of the domain, in the order you meet it
 *
 * 1. **{@link templates}** — reusable tester personas, judge rubrics and summary
 *    prompts. Optional: every config can be supplied inline instead.
 * 2. **{@link runs}** — one evaluation of one conversation. `create` then
 *    `execute`, poll `get`, read `results`.
 * 3. **{@link batches}** — one recipe over many stored conversations.
 * 4. **{@link schedules}** — a cron that materializes a run per tick.
 * 5. **{@link triggers}** — a run started by your users' traffic, not by you.
 * 6. **{@link webhooks}** — where completion is announced.
 *
 * ## Two things that are true of the whole domain
 *
 * 🔴 **Money.** `runs.execute`, `batches.create`, `schedules.create` and an
 * enabled `triggers.upsert` all start model spend. The last two spend
 * REPEATEDLY and unattended. Every cost field is in ten-thousandths of a USD
 * cent, so a `budgetCapUsdTenThousandths` of `10000` is one cent.
 *
 * ⚠️ **Freezing.** A run stores its configuration as fully-resolved text rather
 * than as a template reference, so editing a template never changes a run that
 * already exists. Batches, schedules and triggers take PRE-resolved configs for
 * the same reason and never resolve a template later — which makes their create
 * call the only moment those values are checked at all.
 *
 * @example Score one simulated conversation
 * ```ts
 * const run = await client.agentEvals.runs.create({
 *   name: "refund flow",
 *   sourceMode: "SIMULATED",
 *   targetAgentId: agent.id,
 *   testerConfig: { resolvedSystemPrompt: "You want a refund.", endSignal: "DONE" },
 *   judgeConfigs: [
 *     {
 *       criterion: "politeness",
 *       resolvedRubric: "Score 0-10 on politeness.",
 *       provider: "ANTHROPIC",
 *       model: "claude-sonnet-4-6",
 *       kRepetitions: 3
 *     }
 *   ],
 *   summaryConfig: {
 *     resolvedPrompt: "Summarise the conversation.",
 *     provider: "ANTHROPIC",
 *     model: "claude-sonnet-4-6"
 *   }
 * });
 *
 * await client.agentEvals.runs.execute(run.id);
 * // ... poll client.agentEvals.runs.get(run.id) until status is "COMPLETED"
 * const { rollups, run: finished } = await client.agentEvals.runs.results(run.id);
 * console.log(finished.verdict, rollups);
 * ```
 */
export class AgentEvalsResource extends BaseResource {
  /** Evaluation runs — create, execute, watch, and read the scores. */
  public readonly runs: AgentEvalRunsResource;

  /** Batches — one evaluation recipe fanned out over many stored conversations. */
  public readonly batches: AgentEvalBatchesResource;

  /** Templates — reusable tester personas, judge rubrics and summary prompts. */
  public readonly templates: AgentEvalTemplatesResource;

  /** Schedules — a cron that materializes an evaluation run on every tick. */
  public readonly schedules: AgentEvalSchedulesResource;

  /** Triggers — evaluations started by your users' traffic rather than by you. */
  public readonly triggers: AgentEvalTriggersResource;

  /** Webhooks — where run and batch completion is announced. */
  public readonly webhooks: AgentEvalWebhooksResource;

  constructor(http: HttpClient) {
    super(http);
    this.runs = new AgentEvalRunsResource(http);
    this.batches = new AgentEvalBatchesResource(http);
    this.templates = new AgentEvalTemplatesResource(http);
    this.schedules = new AgentEvalSchedulesResource(http);
    this.triggers = new AgentEvalTriggersResource(http);
    this.webhooks = new AgentEvalWebhooksResource(http);
  }
}
