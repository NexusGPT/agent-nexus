/**
 * `nexus apps …` — tenant-scoped Vibe (Nexus Git + internal deployment
 * platform) commands. Authenticate with the org API key, same as the
 * rest of the tenant CLI.
 *
 * v1 scope: `audit list` (read the per-org audit feed), the `app` group
 * (create / list / get / update / delete / visibility / edge-token /
 * rotate-edge-token / register-as-tool), the `git-project` group (create /
 * list / get / clone / pull / reprovision / delete), `deploy` (trigger a
 * deployment), and the
 * `deployments` group (list / get). Approval / template commands land in later
 * slices.
 *
 * Wire transport detour: these commands use `tenantRequest` (api-key
 * auth + absolute path) instead of the SDK's `createClient`, which
 * hardcodes the `/api/public/v1` prefix. `audit list` hits the
 * `/api/vibe/...` tenant surface; `app register-as-tool` hits the
 * public-v1 bridge at `/api/public/v1/vibe/...` — both authenticate
 * with the same `api-key` header, so one util serves both. See
 * `util/tenant-http.ts` for the full rationale.
 */
import type { Command } from "commander";

import { resolveTenantOpts } from "./apps/_shared/resolve-tenant-opts";
import { registerAppsCreateCommand } from "./apps/app/create.command";
import { registerAppsDeleteCommand } from "./apps/app/delete.command";
import { registerAppsGetCommand } from "./apps/app/get.command";
import { registerAppsListCommand } from "./apps/app/list.command";
import { registerAppsUpdateCommand } from "./apps/app/update.command";
import { registerAppsVisibilityCommand } from "./apps/app/visibility.command";
import { registerAppsApprovalsCommands } from "./apps/approvals/approvals.commands";
import { registerAppsAuditCommands } from "./apps/audit/audit.commands";
import { registerAppsClusterCommands } from "./apps/cluster/cluster.commands";
import { registerAppsDeployCommand } from "./apps/deploy/deploy.command";
import { registerAppsDeployStateCommand } from "./apps/deploy/deploy-state.command";
import { registerAppsLogsCommand } from "./apps/deploy/logs.command";
import { registerAppsRollbackCommand } from "./apps/deploy/rollback.command";
import { registerAppsDeploymentsCommands } from "./apps/deployments/deployments.commands";
import { registerAppsDomainsCommands } from "./apps/domains/domains.commands";
import { registerAppsEnvCommands } from "./apps/env/env.commands";
import { registerAppsGitProjectCommands } from "./apps/git-project/git-project.commands";
import { registerAppsAttachRepoCommand } from "./apps/repo/attach-repo.command";
import { registerAppsGitCredentialsCommand } from "./apps/repo/git-credentials.command";
import { registerAppsProvisionRepoCommand } from "./apps/repo/provision-repo.command";
import { registerAppsReprovisionRepoCommand } from "./apps/repo/reprovision-repo.command";
import { registerAppsEdgeTokenCommand } from "./apps/token/edge-token.command";
import { registerAppsRegisterAsToolCommand } from "./apps/token/register-as-tool.command";
import { registerAppsRotateEdgeTokenCommand } from "./apps/token/rotate-edge-token.command";
import { registerStarterCommand } from "./apps-starter";
import { registerVendorPackageCommand } from "./apps-vendor-package";

const APPS_HELP = `
Subcommands:
  list             List the org's Vibe apps, newest-first — where app ids come from.
  create           Create an app record.
  get              Show one app by id.
  update           Update an app (partial — only the flags you pass change).
  delete           Destroy an app and stop serving it.
  visibility       Make an app browser-reachable, or private again.
  logs             Read a deployed app's runtime logs, and optionally follow them.
  provision-repo   Give an app a new repo — or attach-repo for one you have.
  attach-repo      Bind an existing git project to an app.
  reprovision-repo Rebuild an app's repo backing.
  register-as-tool Register a healthy deployed app as an agent tool.
  edge-token       Reveal the bearer token that reaches a private deployed app.
  rotate-edge-token  Replace that token.
  deploy           Trigger a deployment for an app from a commit sha.
  deploy-state     Did my push land, and is what I pushed what is live?
  rollback         Roll an app back to its previous healthy version.
  starter          Download the org app starter into a directory, UI library
                   vendored — no npm token needed.
  git-credentials  Fetch your tenant git push token + clone address.
  cluster          Provision / inspect your org's dedicated Vibe cluster.
  git-project      Manage git projects — the standalone code store apps deploy from.
  deployments      List / inspect an app's deployments and their build jobs.
  domains          Serve an app on a host you own — add prints the DNS records
                   (a CNAME for a subdomain, A records for an apex).
  env              An app's environment — list, set and remove plaintext vars,
                   and read the access cards imported into it.
  approvals        Review gated deployments — pending queue, get, approve/reject.
  audit            Inspect the per-org Vibe audit feed (deployments, approvals,
                   cost-safety state changes, rollbacks).

🚨 THIS NAMESPACE PROVISIONS REAL CLOUD INFRASTRUCTURE THAT COSTS MONEY AND
OUTLIVES THE COMMAND. A cluster, a git host and every running deployment keep
consuming until something removes them; nothing here is a sandbox and nothing
expires on its own. Treat "cluster provision", "create", "deploy" and
"provision-repo" as spend, and clean up what you were only trying out.

THE SUBCOMMANDS ARE LISTED ALPHABETICALLY AND THAT IS NOT THE ORDER TO RUN THEM.
End to end, once the cluster exists:

  1. apps create                the app record
  2. apps provision-repo        a new repo — or attach-repo for one you have
  3. apps git-credentials       your push token AND the address to push to
  4. apps git-project clone     then commit and push with plain git — there is
                                no "git-project commit" or "git-project push"
                                verb, and the remote comes from step 3
  5. apps deploy                names the commit sha to build
  6. apps deploy-state          did the push land, is it what is live
  7. apps register-as-tool      only once a deployment is healthy

Each step's own --help is right about its step; nothing but this list says how
they compose.

This surface is feature-flagged — your org must have the VIBE feature
flag enabled. If you get a 403, ping platform-ops to flip the flag.
`;

/** Wires the `nexus apps` namespace: the root command, then every leaf. */
export function registerAppsCommands(program: Command): void {
  const apps = program
    .command("apps")
    .description("Nexus Git + internal deployment platform (Vibe)")
    .addHelpText("after", APPS_HELP);

  registerAppsClusterCommands(apps, program);
  registerAppsListCommand(apps, program);
  registerAppsGetCommand(apps, program);
  registerAppsLogsCommand(apps, program);
  registerAppsUpdateCommand(apps, program);
  registerAppsCreateCommand(apps, program);
  registerAppsVisibilityCommand(apps, program);
  registerAppsDeleteCommand(apps, program);
  registerAppsEdgeTokenCommand(apps, program);
  registerAppsRotateEdgeTokenCommand(apps, program);
  registerAppsRegisterAsToolCommand(apps, program);
  registerAppsProvisionRepoCommand(apps, program);
  registerAppsAttachRepoCommand(apps, program);
  registerAppsReprovisionRepoCommand(apps, program);
  registerAppsGitProjectCommands(apps, program);
  registerAppsGitCredentialsCommand(apps, program);
  registerAppsDeployCommand(apps, program);
  registerAppsDeployStateCommand(apps, program);
  registerAppsRollbackCommand(apps, program);
  registerAppsDeploymentsCommands(apps, program);
  registerAppsEnvCommands(apps, program);
  registerAppsDomainsCommands(apps, program);
  registerAppsApprovalsCommands(apps, program);
  registerAppsAuditCommands(apps, program);
  registerStarterCommand(apps, () => resolveTenantOpts(program));
  registerVendorPackageCommand(apps, () => resolveTenantOpts(program));
}
