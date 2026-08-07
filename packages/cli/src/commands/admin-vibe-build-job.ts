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
