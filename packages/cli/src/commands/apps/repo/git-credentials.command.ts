import type { Command } from "commander";

import { handleError } from "../../../errors";
import { fetchGitProjectCredentials } from "../_shared/fetch-git-project-credentials";
import { printGitCredentials } from "../_shared/print-git-credentials";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-credentials <projectId>` */
export function registerAppsGitCredentialsCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("git-credentials <projectId>")
    .description("Fetch one git project's push credential + clone address")
    .addHelpText(
      "after",
      `
Returns the push credential for ONE git project: a machine user that is a
write collaborator on that project's repository and can reach no other. Find
the project id with "nexus apps git-project list".

Prefer the commands that use it for you and store it nowhere:
  $ nexus apps git-project clone <projectId>
  $ nexus apps git-project pull <projectId>

To push, keep the token out of every credential store — the empty helper
switches off the ones you have configured (the macOS keychain included) for
that one command, and git asks for the token instead:
  $ creds=$(nexus apps git-credentials <projectId> --json)
  $ url=$(echo "$creds" | jq -r '.cloneUrl')
  $ git -c credential.helper= push "$url" HEAD:main
  (username: the "username" field; password: the "pushToken" field)

Never embed the token in a remote URL: git writes that URL, token and all,
into .git/config, where it outlives the command.

Every project's repo is created with an initial commit already on it, so a
FIRST push from a local repo you started yourself is a non-fast-forward and git
rejects it with a bare "fetch first" — decided on your machine, so nothing on
the git host can explain it. Clone the project, or fetch and rebase first.

The pushToken is a LIVE SECRET. Treat the whole payload as sensitive.

Returns 403 if you hold no grant on an app this project backs, 404 if no such
project exists in your org, 409 if its credential is not provisioned yet
(retry shortly).

Examples:
  $ nexus apps git-credentials 11111111-2222-4333-8444-555555555555
  $ nexus apps git-credentials 11111111-2222-4333-8444-555555555555 --json | jq -r '.cloneUrl'

Notes:
  THE "Org" ROW IS NOT YOUR NEXUS ORGANIZATION. forgejoOrg is the path segment
  every tenant repository lives under on the git host — <host>/<org>/<repo>.git
  — and it is already baked into cloneUrl. gitHostName ("Git host") is that
  host's DNS name alone, with no scheme and no org segment.
`
    )
    .action(async (projectId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        printGitCredentials(await fetchGitProjectCredentials(opts, projectId));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
