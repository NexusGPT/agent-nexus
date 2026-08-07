import { HttpClient } from "@agent-nexus/sdk";
import { Command } from "commander";

import { timeoutSecondsToMs } from "../client";
import { resolveApiKey, resolveBaseUrl } from "../config";
import { handleError } from "../errors";
import { isJsonMode, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

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

  run
    .command("create")
    .description("Create a run (DRAFT state)")
    .option("--body <json>", "Run config JSON (string, .json file, or '-' for stdin)")
    .option("--name <name>", "Run name")
    .option("--source-mode <mode>", "SIMULATED | INBOX")
    .option("--target-deployment-id <id>", "Target deployment (SIMULATED)")
    .option("--target-agent-id <id>", "Target agent (SIMULATED)")
    .option("--source-chat-id <id>", "Source inbox chat (INBOX)")
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

  addPaginationOptions(
    run
      .command("list")
      .description("List runs")
      .option("--agent-id <id>", "Filter by target agent")
      .option("--status <status>", "Filter by run status")
      .option("--source-mode <mode>", "Filter by source mode")
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
    .action(async (id: string) => {
      try {
        await send("GET", `/agent-evals/runs/${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  run
    .command("delete")
    .description("Delete a run")
    .argument("<run-id>")
    .option("--yes", "Skip confirmation")
    .action(async (id: string) => {
      try {
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
    .action(async (opts) => {
      try {
        await send("POST", "/agent-evals/batches", { body: await resolveBody(opts.body) });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  addPaginationOptions(
    batch
      .command("list")
      .description("List batches")
      .option("--status <status>", "Filter by status")
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

  addPaginationOptions(
    template
      .command("list")
      .description("List templates (GLOBAL seeds ∪ agent-attached)")
      .option("--agent-id <id>", "Scope to GLOBAL ∪ templates attached to this agent")
      .option("--kind <kind>", "TESTER_PERSONA | JUDGE_RUBRIC | SUMMARY_PROMPT")
      .option("--scope <scope>", "GLOBAL | AGENT")
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

  addPaginationOptions(
    template
      .command("importable")
      .description("List templates importable onto an agent")
      .requiredOption("--agent-id <id>", "Agent the picker is relative to")
      .option("--kind <kind>", "TESTER_PERSONA | JUDGE_RUBRIC | SUMMARY_PROMPT")
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
    .action(async (id: string, opts) => {
      try {
        await send("PATCH", `/agent-evals/templates/${id}`, { body: await resolveBody(opts.body) });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  template
    .command("delete")
    .description("Delete an agent template (GLOBAL → 403)")
    .argument("<template-id>")
    .option("--yes", "Skip confirmation")
    .action(async (id: string) => {
      try {
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
    .action(async (id: string, opts) => {
      try {
        await send("POST", `/agent-evals/templates/${id}/attach`, {
          body: { agentId: opts.agentId }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  template
    .command("detach")
    .description("Detach a template from an agent")
    .argument("<template-id>")
    .argument("<agent-id>")
    .option("--yes", "Skip confirmation")
    .action(async (id: string, agentId: string) => {
      try {
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
    .action(async (opts) => {
      try {
        await send("POST", "/agent-evals/schedules", { body: await resolveBody(opts.body) });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  addPaginationOptions(
    schedule
      .command("list")
      .description("List schedules")
      .option("--status <status>", "ACTIVE | PAUSED")
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
    .action(async (id: string, opts) => {
      try {
        await send("PATCH", `/agent-evals/schedules/${id}`, { body: await resolveBody(opts.body) });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  schedule
    .command("delete")
    .description("Delete a schedule")
    .argument("<schedule-id>")
    .option("--yes", "Skip confirmation")
    .action(async (id: string) => {
      try {
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
    .action(async (opts) => {
      try {
        await send("PUT", "/agent-evals/triggers", { body: await resolveBody(opts.body) });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  trigger
    .command("list")
    .description("List triggers")
    .option("--agent-id <id>", "Filter by agent")
    .option("--deployment-id <id>", "Filter by deployment")
    .option("--kind <kind>", "AUTO_ON_CLOSE | SCHEDULED_SAMPLE")
    .option("--enabled-only", "Only enabled triggers")
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

  trigger
    .command("delete")
    .description("Delete a trigger")
    .argument("<trigger-id>")
    .option("--yes", "Skip confirmation")
    .action(async (id: string) => {
      try {
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
    .action(async (id: string) => {
      try {
        await send("GET", `/agent-evals/webhooks/${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  webhook
    .command("delete")
    .description("Delete a webhook")
    .argument("<webhook-id>")
    .option("--yes", "Skip confirmation")
    .action(async (id: string) => {
      try {
        await http().request("DELETE", `/agent-evals/webhooks/${id}`);
        printSuccess(`Deleted webhook ${id}`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
