/**
 * `nexus admin vibe-build-job …` — the build-job state machine, by hand.
 *
 * Four verbs, one per transition an operator can drive: claim, succeed, fail
 * and time-out. The build runner drives the same use cases through DI; these
 * exist for QA and for manual recovery when a job is wedged.
 *
 * `parseDurationMs` refuses locally and exits 5 rather than spending a round
 * trip to be told the same thing by the backend's Zod boundary.
 */

import { Command } from "commander";

import { type AdminVibeBuildJobResponse } from "../admin-wire-types";
import { color, printRecord } from "../output";
import { AdminCliError, handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";

export function registerVibeBuildJobCommands(admin: Command, program: Command): void {
  const bj = admin
    .command("vibe-build-job")
    .description("Drive the Vibe build-job state machine (claim / succeed / fail / time-out)");

  bj.command("claim")
    .description("PENDING → RUNNING. Records the live log-stream key.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id (tenant scope)")
    .requiredOption(
      "--logs-ref <s3Key>",
      "S3 key for the live build log stream. Required, non-empty."
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-job claim 11111111-1111-4111-8111-… \\
      --org org_abc --logs-ref s3://vibe-logs/2026-05-27/build-abc.log

Notes:
  PENDING → RUNNING. This is the transition the build runner normally drives
  through DI; the verb exists for QA and for recovering a job that is wedged.
  --logs-ref is the LIVE stream key, and it is required and non-empty. The
  archived key is a different value and goes in later, on "succeed" or "fail".
  --org is the tenant scope and is sent in the body, not inferred from the id.
  Answers with the whole job row, status included, so no read-back is needed.
`
    )
    .action(async (id: string, cmdOpts: { org: string; logsRef: string }) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/claim`,
          body: { organizationId: cmdOpts.org, logsRef: cmdOpts.logsRef }
        });
        printBuildJobRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  bj.command("succeed")
    .description("RUNNING → SUCCEEDED. Records final durationMs + optional archived logs ref.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock build time in milliseconds (non-negative int)")
    .option("--logs-ref <s3Key>", "Override the live-stream key with the archived final key")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-job succeed 11111111-1111-4111-8111-… \\
      --org org_abc --duration-ms 84213
  $ nexus admin vibe-build-job succeed 11111111-1111-4111-8111-… \\
      --org org_abc --duration-ms 84213 --logs-ref s3://vibe-logs/archive/build-abc.log

Notes:
  RUNNING → SUCCEEDED. Only a claimed job can succeed.
  --duration-ms IS CHECKED BEFORE ANYTHING IS SENT. It must be a non-negative
  integer; anything else is refused locally, so a typo costs no round trip and
  leaves the job untouched.
  --logs-ref is optional here and REPLACES the live key recorded at claim time.
  Omit it and the row keeps pointing at the live stream, which is correct only
  while that stream still exists.
`
    )
    .action(async (id: string, cmdOpts: { org: string; durationMs: string; logsRef?: string }) => {
      try {
        const durationMs = parseDurationMs(cmdOpts.durationMs);
        const opts = resolveAdminOpts(program, admin);
        const body: { organizationId: string; durationMs: number; logsRef?: string } = {
          organizationId: cmdOpts.org,
          durationMs
        };
        if (cmdOpts.logsRef !== undefined) body.logsRef = cmdOpts.logsRef;
        const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
          method: "POST",
          path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/succeed`,
          body
        });
        printBuildJobRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  bj.command("fail")
    .description("RUNNING → FAILED. Records errorReason verbatim for the CLI surface.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock at failure (non-negative int)")
    .requiredOption("--error-reason <text>", "Customer-visible failure rationale (1-2000 chars)")
    .option("--logs-ref <s3Key>", "Override the live-stream key with the archived final key")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-job fail 11111111-1111-4111-8111-… \\
      --org org_abc --duration-ms 12044 --error-reason "pnpm install exited 1"

Notes:
  RUNNING → FAILED.
  🚨 --error-reason IS CUSTOMER-VISIBLE. It is stored verbatim and surfaced, so
  write what the customer needs to act on and keep internal hostnames, stack
  traces and ticket numbers out of it. It is required, 1-2000 characters.
  --duration-ms is the wallclock AT FAILURE, not the budget, and it is refused
  locally unless it is a non-negative integer.
  --logs-ref is optional and replaces the live key with the archived one.
`
    )
    .action(
      async (
        id: string,
        cmdOpts: { org: string; durationMs: string; errorReason: string; logsRef?: string }
      ) => {
        try {
          const durationMs = parseDurationMs(cmdOpts.durationMs);
          const opts = resolveAdminOpts(program, admin);
          const body: {
            organizationId: string;
            durationMs: number;
            errorReason: string;
            logsRef?: string;
          } = {
            organizationId: cmdOpts.org,
            durationMs,
            errorReason: cmdOpts.errorReason
          };
          if (cmdOpts.logsRef !== undefined) body.logsRef = cmdOpts.logsRef;
          const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
            method: "POST",
            path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/fail`,
            body
          });
          printBuildJobRecord(data);
        } catch (err) {
          process.exitCode = handleAdminError(err);
        }
      }
    );

  bj.command("time-out")
    .description("RUNNING → TIMED_OUT. Supervisor escape hatch when the runner went silent.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock at timeout (non-negative int)")
    .option(
      "--error-reason <text>",
      'Override the canned "wallclock exceeded" surface (e.g. "Nomad allocation evicted").'
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-build-job time-out 11111111-1111-4111-8111-… \\
      --org org_abc --duration-ms 900000
  $ nexus admin vibe-build-job time-out 11111111-1111-4111-8111-… \\
      --org org_abc --duration-ms 900000 --error-reason "Nomad allocation evicted"

Notes:
  RUNNING → TIMED_OUT. The supervisor's escape hatch for a runner that went
  silent — use it when nothing is going to report, not when a build failed.
  "fail" is the verb for a build that ran and lost.
  --error-reason is OPTIONAL here and that is the difference from "fail": leave
  it out and the customer sees the canned wallclock message. Supply it only to
  name a truer cause, and remember it is customer-visible either way.
  --duration-ms is the wallclock at timeout and is refused locally unless it is
  a non-negative integer.
`
    )
    .action(
      async (id: string, cmdOpts: { org: string; durationMs: string; errorReason?: string }) => {
        try {
          const durationMs = parseDurationMs(cmdOpts.durationMs);
          const opts = resolveAdminOpts(program, admin);
          const body: { organizationId: string; durationMs: number; errorReason?: string } = {
            organizationId: cmdOpts.org,
            durationMs
          };
          if (cmdOpts.errorReason !== undefined) body.errorReason = cmdOpts.errorReason;
          const data = await adminRequest<AdminVibeBuildJobResponse>(opts, {
            method: "POST",
            path: `/api/admin/vibe/build-jobs/${encodeURIComponent(id)}/time-out`,
            body
          });
          printBuildJobRecord(data);
        } catch (err) {
          process.exitCode = handleAdminError(err);
        }
      }
    );
}

function parseDurationMs(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw AdminCliError.localValidation(
      `Invalid --duration-ms value "${raw}". Expected a non-negative integer.`
    );
  }
  return parsed;
}

function printBuildJobRecord(data: AdminVibeBuildJobResponse): void {
  printRecord(data, [
    { key: "id", label: "Build job" },
    { key: "vibeDeploymentId", label: "Deployment" },
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: formatBuildJobStatus },
    { key: "builder", label: "Builder" },
    { key: "logsRef", label: "Logs ref", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "durationMs", label: "Duration (ms)", format: (v) => (v == null ? "—" : String(v)) },
    { key: "errorReason", label: "Error reason", format: (v) => (v == null ? "—" : String(v)) },
    { key: "createdAt", label: "Created" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

function formatBuildJobStatus(v: unknown): string {
  const status = String(v);
  if (status === "FAILED" || status === "TIMED_OUT") return color.red(status);
  if (status === "RUNNING") return color.yellow(status);
  if (status === "SUCCEEDED") return color.green(status);
  return status;
}
