/**
 * `nexus admin vibe-build-job succeed` — RUNNING → SUCCEEDED.
 *
 * `--logs-ref` is optional here and REPLACES the live key recorded at claim
 * time. Omitted, the row keeps pointing at the live stream, which is correct
 * only while that stream still exists.
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
`;

/** Registers the verb on the `vibe-build-job` command group. */
export function registerVibeBuildJobSucceedCommand(
  bj: Command,
  admin: Command,
  program: Command
): void {
  bj.command("succeed")
    .description("RUNNING → SUCCEEDED. Records final durationMs + optional archived logs ref.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id")
    .requiredOption("--duration-ms <n>", "Wallclock build time in milliseconds (non-negative int)")
    .option("--logs-ref <s3Key>", "Override the live-stream key with the archived final key")
    .addHelpText("after", HELP)
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
}
