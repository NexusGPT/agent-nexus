/**
 * `nexus admin vibe-build-job claim` — PENDING → RUNNING.
 *
 * The build runner drives this same use case through DI; the verb exists for QA
 * and for recovering a job that is wedged. `--logs-ref` is the LIVE stream key;
 * the archived key is a different value and goes in later, on `succeed` or
 * `fail`.
 */

import type { Command } from "commander";

import { type AdminVibeBuildJobResponse } from "../../admin-wire-types";
import { handleAdminError } from "../../util/admin-errors";
import { adminRequest } from "../../util/admin-http";
import { resolveAdminOpts } from "../../util/admin-opts";
import { printBuildJobRecord } from "./_shared/print-build-job-record";

const HELP = `
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
`;

/** Registers the verb on the `vibe-build-job` command group. */
export function registerVibeBuildJobClaimCommand(
  bj: Command,
  admin: Command,
  program: Command
): void {
  bj.command("claim")
    .description("PENDING → RUNNING. Records the live log-stream key.")
    .argument("<id>", "Build job UUID")
    .requiredOption("--org <orgId>", "Owning organization id (tenant scope)")
    .requiredOption(
      "--logs-ref <s3Key>",
      "S3 key for the live build log stream. Required, non-empty."
    )
    .addHelpText("after", HELP)
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
}
