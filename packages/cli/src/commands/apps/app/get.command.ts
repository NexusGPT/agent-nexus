import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetVibeAppResponse } from "../../../vibe-wire-types";
import { printVibeApp } from "../_shared/print-vibe-app";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps get` */
export function registerAppsGetCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("get <appId>")
    .description("Show one Vibe app by id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus apps get 11111111-2222-4333-8444-555555555555
  $ nexus --json apps get 11111111-2222-4333-8444-555555555555

Notes:
  THIS READ RESOLVES TWO JOINS NO OTHER APP COMMAND DOES. "deployability" and
  "gitProject" sit BESIDE the app, never on it, and create/update answer without
  them — so a script reading either off "apps update" gets undefined rather
  than a value.
    deployability  DEPLOYABLE, NO_SOURCE_ATTACHED or SOURCE_NOT_READY — the
                   one-field answer to "why does my URL do nothing".
    gitProject     A NESTED OBJECT {id, name, status}, or null. THERE IS NO
                   gitProjectId SCALAR on this response: parsing for one returns
                   null on a correctly attached app and reads as "no repo".
  THE "Ship gate" ROW PRINTS shipGateMode ITSELF — off, warn or enforce. warn
  means the gate reads the repository and ships the deploy anyway, so it is NOT
  off: those deploys write DEPLOYMENT_VERIFICATION_WARNED. The boolean
  requireVerification also rides the wire and is a LOSSY projection of the same
  field (warn reads false there) — do not parse it to decide whether a gate is
  running. "Ship gate: not reported by this server" means the backend predates
  the field, never that the gate is off.
  "Edge: not checked yet" IS THE COMMON CASE AND IS NOT A FAULT.
  edgeReachability stays null until the probe has seen a healthy, settled
  deployment, and edgeReachabilityAt / edgeReachabilityDetail are null with it.
  A null is never reachability.
  --json CARRIES MORE THAN THE TABLE: organizationId, createdByUserId,
  requireVerification and healthCheckConfig ride the wire and no table row
  shows them.
  The two joins are merged in at the TOP level rather than nested.`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetVibeAppResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}`
        });
        // Only claim the joins when this server actually reported them. On a
        // backend predating `deployability` the field is simply absent, and
        // rendering `Source: none` from that would assert the app has no git
        // project when nobody was asked — the exact conflation this ticket
        // exists to remove, reintroduced one layer up.
        printVibeApp(
          data.app,
          data.deployability === undefined
            ? undefined
            : { deployability: data.deployability, gitProject: data.gitProject ?? null }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
