import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type SingleVibeAppResponse } from "../../../vibe-wire-types";
import { buildAppUpdateBody } from "../_shared/build-app-update-body";
import { printVibeApp } from "../_shared/print-vibe-app";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

const UPDATE_HELP = `
Every field is optional; only the flags you pass are changed (the rest are
left untouched). At least one flag is required. --resource-quotas and
--health-check each replace the entire object atomically — the server
fully validates the new shape, so pass every field.

Examples:
  $ nexus apps update 11111111-2222-4333-8444-555555555555 --deploy-branch release/prod
  $ nexus apps update 11111111-2222-4333-8444-555555555555 --require-approvals true
  $ nexus apps update 11111111-2222-4333-8444-555555555555 --ship-gate warn
  $ nexus apps update 11111111-2222-4333-8444-555555555555 --resource-quotas '{"cpuMhz":1000,"memoryMiB":1024,"maxInstances":5}'

Notes:
  --ship-gate IS THE FLAG THAT REACHES ALL THREE STATES. The app stores
  shipGateMode: OFF, WARN or ENFORCE, and this flag takes off, warn or enforce
  (any case).
    off      the gate never reads the repository.
    warn     the gate reads it, records what it found, and ships the deploy
             anyway. This is the on-ramp: turn it on across a fleet, then read
             "nexus apps audit list --type DEPLOYMENT_VERIFICATION_WARNED" to
             see how often ENFORCE would have refused before you enforce.
    enforce  a missing or red artifact refuses the deploy.
  --require-verification IS A TWO-STATE FLAG OVER A THREE-STATE FIELD, kept for
  scripts written before --ship-gate existed. true maps to ENFORCE and false to
  OFF, so it cannot reach WARN at all.
  PASSING BOTH IS REFUSED HERE, BEFORE THE REQUEST. The API resolves the
  contradiction in favour of shipGateMode — deliberately, since the boolean
  cannot express WARN — but a person who typed both flags on one command line
  made a mistake in that line, and silently discarding one of them is how the
  gate ends up in a state nobody chose. Pass --ship-gate alone.
`;

/** `nexus apps update` */
export function registerAppsUpdateCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("update <appId>")
    .description("Update a Vibe app (partial — only the flags you pass change)")
    .option(
      "--deploy-branch <branch>",
      "Branch whose pushes deploy (plain name, e.g. main or release/prod)."
    )
    .option("--description <text>", "Set the app description.")
    .option("--require-approvals <bool>", "Gate prod deploys behind approval. One of: true, false.")
    .option(
      "--ship-gate <mode>",
      "How hard the ship gate applies. One of: off, warn, enforce. warn checks the artifacts and ships anyway."
    )
    .option(
      "--require-verification <bool>",
      "Refuse deploys whose declared verification artifacts are missing or red. One of: true, false. Two-state: cannot reach warn — use --ship-gate."
    )
    .option(
      "--resource-quotas <json>",
      'Full Nomad quotas object, e.g. \'{"cpuMhz":1000,"memoryMiB":1024,"maxInstances":5}\'. Replaces the whole object.'
    )
    .option(
      "--health-check <json>",
      "Full health-check policy object (path/port/timeouts/thresholds). Replaces the whole object."
    )
    .addHelpText("after", UPDATE_HELP)
    .action(
      async (
        appId: string,
        cmdOpts: {
          deployBranch?: string;
          description?: string;
          requireApprovals?: string;
          // Both gate writers, and `requireVerification` was missing here while
          // `buildAppUpdateBody` read it — harmless only because every field is
          // optional, so the narrower object still satisfied the wider one and
          // the flag kept working. A field the action does not declare is a
          // field the next reader believes is unhandled.
          shipGate?: string;
          requireVerification?: string;
          resourceQuotas?: string;
          healthCheck?: string;
        }
      ) => {
        try {
          const body = buildAppUpdateBody(cmdOpts);
          const opts = resolveTenantOpts(program);
          const data = await tenantRequest<SingleVibeAppResponse>(opts, {
            method: "PATCH",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}`,
            body
          });
          printVibeApp(data.app);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
