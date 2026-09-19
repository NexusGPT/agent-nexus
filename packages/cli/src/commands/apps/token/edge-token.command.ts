import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetEdgeTokenResponse } from "../../../vibe-wire-types";
import { printEdgeToken } from "../_shared/print-edge-token";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps edge-token` */
export function registerAppsEdgeTokenCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("edge-token <appId>")
    .description("Reveal the token a caller needs to reach this app while it is private")
    .addHelpText(
      "after",
      `
Notes:
A private app admits a request only when it carries this token in the
X-Vibe-App-Token header. The platform injects it automatically on agent tool
calls; this command is how everything else gets it — a partner system, a CI job,
a developer with curl or Postman.

That is the middle ground between the two extremes: the app stays private, and a
caller you hand the token to can still reach it. Going --public to unblock a
caller removes app-level auth for everyone, and is not the same trade.

A PUBLIC app has no token and this command returns 409 — it needs none, since
anyone with the URL already reaches it.

A TOKEN THAT SUDDENLY STOPS WORKING IS USUALLY A VISIBILITY FLIP, NOT AN
EXPIRY. Going public DESTROYS the token (this command then 409s); going private
again mints a FRESH one rather than restoring the old. Either direction breaks
every caller holding the previous value, including registered tools. Check
"nexus apps get <appId>" for the current mode before hunting for a rotation
you did not run.

The token is printed in full. Treat the output as a secret: pipe it, don't paste
it into a shared terminal.

Examples:
  $ nexus apps edge-token 11111111-2222-4333-8444-555555555555
  $ nexus --json apps edge-token 11111111-2222-4333-8444-555555555555
`
    )
    .action(async (appId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetEdgeTokenResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/edge-token`
        });
        printEdgeToken(data.edgeToken);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
