import type { Command } from "commander";

import { handleError } from "../../../errors";
import { isJsonMode } from "../../../output";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetDeployStateResponse } from "../../../vibe-wire-types";
import { qualifyRefName, renderDeployState } from "../../apps-deploy-state";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

const DEPLOY_STATE_HELP = `
One read of the control plane replaces parsing 'git push' output — which
cannot be done reliably: rejection lines print FIRST (so piping through
'tail' destroys them), '-q' hides the success report but not the failure
one, a backgrounded push carries no outcome at all, and an error quoting a
remote URL looks exactly like a success report.

Branch on 'outcome', never on the exit code. This command exits 0 whenever
the QUESTION was answered; NOT_RECEIVED is a successful read of a bad
situation, not a failed command. (The verb that branches on exit code is
'apps deploy --watch'.)

  DEPLOYED               a deployment exists for this commit
  RECEIVED_NOT_DEPLOYED  the push landed and nothing deployed it
  NOT_RECEIVED           no ref head carries this commit
  REF_UNKNOWN            that ref has never been pushed to
  NO_REPOSITORY          the app has no git project attached

Live vs Served — the distinction the output exists to keep apart:

  Live    the newest HEALTHY deployment. That is the ALLOCATION's verdict
          and it lands BEFORE the edge swaps, so it is not "what the URL
          returns".
  Served  the deployment the edge was last OBSERVED answering with, always
          printed with the age of that observation. Nothing re-checks it,
          so an old observation says nothing about the present.

'Not proven served' NEVER means 'not serving'. The proof sweep only
considers a recently-healthy deployment, so a slow swap — or an app the
probe cannot reach — stays unproven permanently while serving fine.

--sha and --ref are two different questions and cannot be combined. Pass
neither to ask about the app's own deploy branch, which is what someone who
just ran 'git push' wants and cannot always name.

Examples:
  $ nexus apps deploy-state 11111111-2222-4333-8444-555555555555
  $ nexus apps deploy-state 11111111-2222-4333-8444-555555555555 --sha 1a2b3c4
  $ nexus apps deploy-state 11111111-2222-4333-8444-555555555555 --ref main
  $ nexus apps deploy-state 11111111-2222-4333-8444-555555555555 --json

Notes:
  EACH OUTCOME NAMES A DIFFERENT FIX, AND ONLY ONE OF THEM IS ABOUT THE PUSH.
    NO_REPOSITORY          "apps attach-repo <appId> <gitProjectId>", then
                           re-run this. "apps git-project list" finds the id.
    RECEIVED_NOT_DEPLOYED  the push LANDED, so nothing about it needs redoing.
                           Three causes: it went to a branch that is not the
                           app's deploy branch ("apps update
                           --deploy-branch"); no app is attached to the project
                           it went to ("apps attach-repo"); or the org is
                           suspended ("apps audit list --type
                           COST_SAFETY_AUTO_SUSPENDED").
    NOT_RECEIVED           ask about the REF instead — "--ref <branch>". Ref
                           rows record HEADS, so a commit that landed and was
                           then pushed past reads exactly like one that never
                           arrived.
    REF_UNKNOWN            nothing was ever pushed to that ref. Check the
                           spelling before checking the server.
    DEPLOYED               nothing to fix; read the status lines under it.
`;

/**
 * The push-to-deploy answer, in one call — see `apps-deploy-state.ts` for why
 * the rendering is a separate, pure module.
 *
 * A thin wrapper on purpose: the endpoint already carries a discriminated
 * `outcome` and the served-artifact identity, so this command adds a way to
 * REACH them and nothing else. Shipping the endpoint without one left every
 * client back on parsing `git push` stdout, which is the defect the endpoint
 * was built to retire.
 */
export function registerAppsDeployStateCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("deploy-state <appId>")
    .description("Did my push land, and is what I pushed what is live?")
    .option(
      "--sha <sha>",
      "Ask about one exact commit (7–40 hex chars). Preferred right after a push — it stays correct once the ref advances."
    )
    .option(
      "--ref <ref>",
      "Ask about a ref's current head. A bare branch name is expanded to refs/heads/<name>; pass refs/tags/<name> for a tag."
    )
    .addHelpText("after", DEPLOY_STATE_HELP)
    .action(async (appId: string, cmdOpts: { sha?: string; ref?: string }) => {
      try {
        // Refused here rather than at the server so the message names the two
        // flags the caller typed. The backend refuses it too — this is the
        // round trip, not the guarantee.
        if (cmdOpts.sha !== undefined && cmdOpts.ref !== undefined) {
          throw new Error(
            "pass --sha or --ref, never both — they are two different questions and there is no single answer to both"
          );
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetDeployStateResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deploy-state`,
          query: {
            sha: cmdOpts.sha,
            ref: cmdOpts.ref === undefined ? undefined : qualifyRefName(cmdOpts.ref)
          }
        });

        if (isJsonMode()) {
          // The wire envelope, untouched — the discriminator and the served
          // observation are what a jq consumer is here for.
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(renderDeployState(data, Date.now()).join("\n"));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
