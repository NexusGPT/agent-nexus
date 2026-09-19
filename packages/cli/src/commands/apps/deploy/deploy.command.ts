import type { Command } from "commander";

import { handleError } from "../../../errors";
import { isJsonMode } from "../../../output";
import { printTriggeredDeployment } from "../_shared/print-triggered-deployment";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { resolveTriggerSha } from "../_shared/resolve-trigger-sha";
import { runDeploymentWatch } from "../_shared/run-deployment-watch";
import { triggerDeploymentAnsweringOverage } from "../_shared/trigger-deployment-answering-overage";

const DEPLOY_HELP = `
Notes:
Triggers one push→build→deploy attempt: the deployment lands in BUILDING
and its sibling build job in PENDING; the build + deploy runners carry it
forward asynchronously. If the app has approvals enabled, the deploy waits
in AWAITING_APPROVAL until a reviewer decides.

Usage soft limit: if the org is over its Vibe usage cap for the current
billing period, the deploy is not refused — it ASKS. Interactively you get
a y/N prompt; non-interactively nothing is deployed and the command exits
non-zero, printing the exact --confirm-overage re-run. Pass
--confirm-overage upfront to answer the question in advance. It does NOT
bypass an admin suspension, which still fails with 403.

--watch blocks until the deployment reaches a terminal state and then
until the tenant's edge confirms the app is actually being SERVED. It
exits 0 for that outcome and NOTHING else, so a script can branch on the
exit code alone. In particular it does not exit 0 on HEALTHY: that is a
verdict from a check against the container's own port, which never
crosses the edge, so an app can be HEALTHY and unreachable.

--force-rebuild builds the sha again rather than deploying the image the
registry already holds for it. The registry is immutable and the tag comes
from the commit, so ordinarily the FIRST build of a sha is the image that
sha will ever have — which makes a redeploy free, and made a sha built
badly once impossible to correct without an empty commit. Use it after a
builder or base-image fix; it costs a full build, so it is not the default.

--skip-verification ships past the server-side gate on an app that has
verification turned on. Without it, such a deploy is REFUSED at dispatch,
before any build starts, if the repo's declared artifacts
(docs/feature-manifest.md, docs/DESIGN.md, docs/SPEC.md,
journeys/.last-pass, docs/COVERAGE.md) are missing at the deployed commit,
or if COVERAGE.md records a FAIL/BLOCKED journey. The refusal is terminal
FAILED, names the artifacts, and costs no build minute: no builder is
contacted. A WARN-mode finding is recorded and the build proceeds.

It is a DELIBERATE, RECORDED bypass, not a quiet one: it writes a
DEPLOYMENT_VERIFICATION_OVERRIDDEN audit row naming you and the commit. On
an app that does not require verification it changes nothing and records
nothing. A refused deploy built nothing, so an override is a fresh deploy of
the same commit and builds it normally.

Examples:
  $ nexus apps deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4
  $ nexus apps deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4d…full40
  $ nexus apps deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --confirm-overage
  $ nexus apps deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --watch
  $ nexus apps deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --force-rebuild
  $ nexus apps deploy 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4 --skip-verification
`;

/** `nexus apps deploy` */
export function registerAppsDeployCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("deploy <appId>")
    .description("Trigger a deployment for an app from a commit sha")
    .requiredOption("--sha <sha>", "Commit sha to deploy (7–40 hex chars).")
    .option(
      "--confirm-overage",
      "Confirm upfront that the deploy may exceed the org's usage soft limit."
    )
    .option("--watch", "Block until the deployment is healthy AND served, then exit 0.")
    .option(
      "--force-rebuild",
      "Build this sha again instead of reusing the image already in the registry."
    )
    .option(
      "--skip-verification",
      "Ship even though the app requires its verification artifacts to be green."
    )
    .addHelpText("after", DEPLOY_HELP)
    .action(
      async (
        appId: string,
        cmdOpts: {
          sha: string;
          confirmOverage?: boolean;
          watch?: boolean;
          forceRebuild?: boolean;
          skipVerification?: boolean;
        }
      ) => {
        try {
          const triggerSha = resolveTriggerSha(cmdOpts.sha);
          const opts = resolveTenantOpts(program);

          const data = await triggerDeploymentAnsweringOverage(
            opts,
            appId,
            triggerSha,
            // The hint has to name the command the operator actually ran. A
            // re-run that silently drops --force-rebuild would deploy the
            // reused image they asked to replace and look like it worked —
            // and one that drops --skip-verification would be refused by the
            // gate the operator just chose to pass.
            `nexus apps deploy ${appId} --sha ${cmdOpts.sha}` +
              `${cmdOpts.forceRebuild === true ? " --force-rebuild" : ""}` +
              `${cmdOpts.skipVerification === true ? " --skip-verification" : ""}` +
              ` --confirm-overage`,
            cmdOpts.confirmOverage === true,
            cmdOpts.forceRebuild === true,
            cmdOpts.skipVerification === true
          );
          // Nothing was created — declined, no TTY to ask, or the org's state
          // moved mid-flight. Nothing to watch, and it must not exit clean.
          if (data === null) {
            process.exitCode = 1;
            return;
          }

          // In --json a watched run prints exactly ONE document, and it is the
          // watch outcome. Printing the trigger as well would put two documents
          // on one stream, which no JSON consumer can read. Human output still
          // shows both: there the trigger line is progress, not a parsed value.
          const watching = cmdOpts.watch === true;
          if (!watching || !isJsonMode()) printTriggeredDeployment(data, appId);

          if (watching) {
            process.exitCode = await runDeploymentWatch(program, appId, data.deployment.id);
          }
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
