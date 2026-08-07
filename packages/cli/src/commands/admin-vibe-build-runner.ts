/**
 * `nexus admin vibe-build-runner …` — one tick of the build-runner pipeline.
 *
 * The production driver is a cron on a sub-second cadence across all tenants.
 * This command fires one tick by hand, for QA and incident response, and prints
 * the structured outcome so the operator can repeat until the queue drains.
 *
 * The printer's `never` fallthrough is what pins it to the schema: a new tick
 * outcome variant lands as a TypeScript error here rather than a silent default.
 */

import { Command } from "commander";

import { type AdminVibeBuildRunnerTickResponse } from "../admin-wire-types";
import { color, printRecord } from "../output";
import { handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";

export function registerVibeBuildRunnerCommands(admin: Command, program: Command): void {
  const runner = admin
    .command("vibe-build-runner")
    .description("Operate the Vibe build-runner pipeline (manual tick)");

  runner
    .command("tick")
    .description(
      "Fire one tick: find next PENDING bundle → claim → dispatch → on failure compensate to FAILED"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-runner tick
  $ nexus admin vibe-build-runner tick --json

Why this exists:
  The build-runner cron is the production driver — sub-second cadence
  across all tenants. This admin command exists for QA + incident
  response: fire a tick now, see the structured outcome, repeat.

Outcome shapes:
  idle                              No PENDING jobs whose parent
                                    deployment is still BUILDING.
  dispatched                        A job was claimed AND handed off
                                    to the executor.
  race_lost                         Another runner claimed the job
                                    between find and our status-
                                    guarded UPDATE.
  dispatch_failed_compensated       The executor refused the job; we
                                    flipped RUNNING → FAILED. The
                                    'retryable' flag is informational
                                    (the user re-triggers either way
                                    for v1).
`
    )
    .action(async () => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeBuildRunnerTickResponse>(opts, {
          method: "POST",
          path: "/api/admin/vibe/build-runner/tick",
          body: {}
        });
        printTickRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });
}

function printTickRecord(data: AdminVibeBuildRunnerTickResponse): void {
  // The discriminated union narrows to flat fields per variant. The
  // never-fallthrough check pins the formatter to the schema — any
  // future variant lands as a TS error here, not a silent default.
  switch (data.kind) {
    case "idle": {
      printRecord({ outcome: color.dim("idle (no PENDING jobs)") }, [
        { key: "outcome", label: "Outcome" }
      ]);
      return;
    }
    case "dispatched": {
      printRecord({ outcome: color.green("dispatched"), buildJobId: data.buildJobId }, [
        { key: "outcome", label: "Outcome" },
        { key: "buildJobId", label: "Build job" }
      ]);
      return;
    }
    case "race_lost": {
      printRecord({ outcome: color.yellow("race_lost"), buildJobId: data.buildJobId }, [
        { key: "outcome", label: "Outcome" },
        { key: "buildJobId", label: "Build job" }
      ]);
      return;
    }
    case "dispatch_failed_compensated": {
      printRecord(
        {
          outcome: color.red("dispatch_failed_compensated"),
          buildJobId: data.buildJobId,
          retryable: data.retryable ? "yes (transient)" : "no (permanent)",
          reason: data.reason
        },
        [
          { key: "outcome", label: "Outcome" },
          { key: "buildJobId", label: "Build job" },
          { key: "retryable", label: "Retryable" },
          { key: "reason", label: "Reason" }
        ]
      );
      return;
    }
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unhandled tick outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
