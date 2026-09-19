import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetGitCredentialsResponse } from "../../../vibe-wire-types";
import { printGitCredentials } from "../_shared/print-git-credentials";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-credentials` */
export function registerAppsGitCredentialsCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("git-credentials")
    .description("Fetch your org's git push token + tenant git host address")
    .addHelpText(
      "after",
      `
The last brick of self-service: returns the push token + clone address for
your tenant's git host, so you can push code with no manual admin step.
Org-scoped — the credential is your own (your org API key authenticates).

Push a repo (the repo name is your Vibe app's repo on the host). --json
prints the credential fields at the top level:
  $ creds=$(nexus apps git-credentials --json)
  $ base=$(echo "$creds" | jq -r '.cloneUrlBase')
  $ user=$(echo "$creds" | jq -r '.username')
  $ tok=$(echo "$creds" | jq -r '.pushToken')
  $ host="\${base#https://}"
  $ git push "https://$user:$tok@\${host}<repo>.git" HEAD:main

That push succeeds against a repo you have already pushed to. It does NOT
succeed as your very FIRST push from a local repo you started yourself: every
project's repo is created with an initial commit already on it, so your first
push is a non-fast-forward and git rejects it with a bare "fetch first".

Nothing on the git host can explain that rejection when it happens — git
decides it locally, on your machine, and never contacts the server. So take
one of these instead:
  $ nexus apps git-project clone <projectId>          # start from the repo
  $ git fetch origin && git rebase origin/<branch>    # keep local work you have

The pushToken is a LIVE SECRET — it grants git push to your repos. Treat the
whole payload as sensitive (don't paste it into shared logs).

Returns 404 if your org has no dedicated git host, 409 if the host has not
finished provisioning yet (retry shortly).

Examples:
  $ nexus apps git-credentials
  $ nexus apps git-credentials --json | jq -r '.cloneUrlBase'

Notes:
  THE "Org" ROW IS NOT YOUR NEXUS ORGANIZATION. forgejoOrg is the path segment
  every tenant repository lives under on the git host — <host>/<org>/<repo>.git
  — and it is already baked into cloneUrlBase. Nothing addresses a Nexus org by
  it, so substituting your organization id there builds a URL that 404s.
  gitHostName ("Git host") is that host's DNS name alone, with no scheme and no
  org segment. Compose a remote from cloneUrlBase; reach for gitHostName only
  where something wants the bare hostname — a credential-helper entry, an
  allowlist, a "git ls-remote" against one repo.
`
    )
    .action(async () => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<GetGitCredentialsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/git-credentials"
        });
        printGitCredentials(data.credentials);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
