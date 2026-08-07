/**
 * `nexus admin vibe-consumption-cap …` — per-org Vibe consumption-cap overrides.
 *
 * Two verbs over one resource. `get` surfaces the raw override AND the resolved
 * effective cap side by side, which is what lets an operator tell "an explicit
 * cap that happens to equal the default" apart from "no override at all".
 *
 * `set` is a tri-state PATCH: omitted leaves a column untouched, "none" clears
 * the override, an integer installs one. That three-way split is the whole
 * reason `parseCapFlag` exists and never sees the omitted case.
 */

import { Command } from "commander";

import { type CapPatchValue, type VibeOrgConsumptionCapResponse } from "../admin-wire-types";
import { printRecord } from "../output";
import { AdminCliError, handleAdminError } from "../util/admin-errors";
import { adminRequest } from "../util/admin-http";
import { resolveAdminOpts } from "../util/admin-opts";

export function registerVibeConsumptionCapCommands(admin: Command, program: Command): void {
  const cap = admin
    .command("vibe-consumption-cap")
    .description("Inspect / override the per-org Vibe consumption caps");

  cap
    .command("get")
    .description("Read one org's consumption-cap overrides + resolved effective caps")
    .argument("<organizationId>", "Target organization id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus admin vibe-consumption-cap get org_abc123
  $ nexus admin vibe-consumption-cap get org_abc123 --json

Output fields:
  computeMinCap / buildMinCap / egressMbCap   Raw override. null = no
                                              override → falls back to the
                                              platform default for that
                                              column.
  effective<Type>Cap                          Resolved value the rollup cron
                                              compares per-tenant consumption
                                              against (override ?? platform
                                              default). Surfacing both lets
                                              the admin distinguish "explicit
                                              cap that happens to equal the
                                              default" from "no override".
  present                                     false = no row exists. true =
                                              row exists, even if all
                                              columns are null (explicit
                                              "leave at defaults" intent).
`
    )
    .action(async (organizationId: string) => {
      try {
        const opts = resolveAdminOpts(program, admin);
        const data = await adminRequest<VibeOrgConsumptionCapResponse>(opts, {
          method: "GET",
          path: `/api/admin/vibe/consumption-cap/${encodeURIComponent(organizationId)}`
        });
        printConsumptionCapRecord(data);
      } catch (err) {
        process.exitCode = handleAdminError(err);
      }
    });

  cap
    .command("set")
    .description("Install / clear per-org consumption-cap overrides (tri-state PATCH)")
    .argument("<organizationId>", "Target organization id")
    .option(
      "--compute <int|none>",
      'Compute-minute cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .option(
      "--build <int|none>",
      'Build-minute cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .option(
      "--egress <int|none>",
      'Egress-MB cap override. Pass an int to install, "none" to clear, omit to leave untouched.'
    )
    .addHelpText(
      "after",
      `
Examples:
  Install a higher compute cap on a heavy customer (other columns untouched):
    $ nexus admin vibe-consumption-cap set org_abc --compute 50000

  Clear the compute override (back to platform default), bump build:
    $ nexus admin vibe-consumption-cap set org_abc --compute none --build 10000

  Forbid all egress for an under-investigation org:
    $ nexus admin vibe-consumption-cap set org_abc --egress 0

Notes:
  Tri-state PATCH — each flag has THREE meanings:
    - omitted        : the column is not in the request body. The backend
                       leaves the existing value untouched.
    - "none"         : the column is sent as JSON null. The backend clears
                       the override; the rollup will use the platform
                       default for that column going forward.
    - <integer>      : the column is sent as a non-negative integer. The
                       backend installs the override.

  At least one flag is required (empty body would be a no-op PATCH and is
  refused locally with exit 5, mirroring the backend's 422).
`
    )
    .action(
      async (
        organizationId: string,
        cmdOpts: { compute?: string; build?: string; egress?: string }
      ) => {
        try {
          const body: {
            computeMinCap?: CapPatchValue;
            buildMinCap?: CapPatchValue;
            egressMbCap?: CapPatchValue;
          } = {};
          if (cmdOpts.compute !== undefined) {
            body.computeMinCap = parseCapFlag("--compute", cmdOpts.compute);
          }
          if (cmdOpts.build !== undefined) {
            body.buildMinCap = parseCapFlag("--build", cmdOpts.build);
          }
          if (cmdOpts.egress !== undefined) {
            body.egressMbCap = parseCapFlag("--egress", cmdOpts.egress);
          }

          if (Object.keys(body).length === 0) {
            throw AdminCliError.localValidation(
              'At least one of --compute / --build / --egress is required. Pass an int to install, "none" to clear, omit to leave a column untouched.'
            );
          }

          const opts = resolveAdminOpts(program, admin);
          const data = await adminRequest<VibeOrgConsumptionCapResponse>(opts, {
            method: "PATCH",
            path: `/api/admin/vibe/consumption-cap/${encodeURIComponent(organizationId)}`,
            body
          });
          printConsumptionCapRecord(data);
        } catch (err) {
          process.exitCode = handleAdminError(err);
        }
      }
    );
}

/**
 * Parse a tri-state cap flag value. Returns:
 *   - null  for the literal string "none" (case-insensitive)
 *   - the parsed integer for anything else
 *
 * Throws `AdminCliError.localValidation` on NaN / negative / non-integer.
 * The caller is responsible for deciding whether to put the result in the
 * body (because the flag was present) or skip it (because the flag was
 * omitted). This function never sees the omitted case.
 */
function parseCapFlag(flag: string, raw: string): CapPatchValue {
  if (raw.trim().toLowerCase() === "none") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw AdminCliError.localValidation(
      `Invalid ${flag} value "${raw}". Expected a non-negative integer or "none".`
    );
  }
  return parsed;
}

function printConsumptionCapRecord(data: VibeOrgConsumptionCapResponse): void {
  printRecord(data, [
    { key: "organizationId", label: "Organization" },
    {
      key: "present",
      label: "Row present",
      format: (v) => (v ? "yes" : "no (using platform defaults)")
    },
    {
      key: "computeMinCap",
      label: "Compute override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveComputeMinCap", label: "Compute effective", format: (v) => String(v) },
    {
      key: "buildMinCap",
      label: "Build override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveBuildMinCap", label: "Build effective", format: (v) => String(v) },
    {
      key: "egressMbCap",
      label: "Egress override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveEgressMbCap", label: "Egress effective", format: (v) => String(v) },
    {
      key: "backupMinCap",
      label: "Backup override",
      format: (v) => (v == null ? "— (default)" : String(v))
    },
    { key: "effectiveBackupMinCap", label: "Backup effective", format: (v) => String(v) },
    { key: "createdAt", label: "Created", format: (v) => (v == null ? "—" : String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => (v == null ? "—" : String(v)) }
  ]);
}
