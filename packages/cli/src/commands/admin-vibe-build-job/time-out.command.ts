/**
 * `nexus admin vibe-build-job time-out` — RUNNING → TIMED_OUT.
 *
 * The supervisor's escape hatch for a runner that went silent — for when
 * nothing is going to report, never for a build that ran and lost. `fail` is
 * that verb.
 *
 * `--error-reason` is OPTIONAL here and that is the whole difference from
 * `fail`: omitted, the customer sees the canned wallclock message.
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
`;

/** Registers the verb on the `vibe-build-job` command group. */
export function registerVibeBuildJobTimeOutCommand(
  bj: Command,
  admin: Command,
  program: Command
): void {
  bj.command("time-out")
    .description("RUNNING → TIMED_OUT. Supervisor escape hatch when the runner went silent.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock at timeout (non-negative int)")
    .option(
      "--error-reason <text>",
      'Override the canned "wallclock exceeded" surface (e.g. "Nomad allocation evicted").'
    )
    .addHelpText("after", HELP)
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
