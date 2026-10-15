/**
 * `nexus admin vibe-build-job fail` — RUNNING → FAILED.
 *
 * 🚨 `--error-reason` IS CUSTOMER-VISIBLE. It is stored verbatim and surfaced,
 * so internal hostnames, stack traces and ticket numbers stay out of it.
 *
 * `--duration-ms` is the wallclock AT FAILURE, not the budget.
 */

import type { Command } from "commander";

import { type AdminVibeBuildJobResponse } from "../../admin-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { parseDurationMs } from "./_shared/parse-duration-ms";
import { printBuildJobRecord } from "./_shared/print-build-job-record";

const HELP = `
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
`;

/** Registers the verb on the `vibe-build-job` command group. */
export function registerVibeBuildJobFailCommand(
  bj: Command,
  admin: Command,
  program: Command
): void {
  bj.command("fail")
    .description("RUNNING → FAILED. Records errorReason verbatim for the CLI surface.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock at failure (non-negative int)")
    .requiredOption("--error-reason <text>", "Customer-visible failure rationale (1-2000 chars)")
    .option("--logs-ref <s3Key>", "Override the live-stream key with the archived final key")
    .addHelpText("after", HELP)
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
}
