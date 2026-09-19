import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type StandaloneVibeGitProjectResponse } from "../../../vibe-wire-types";
import { printVibeGitProject } from "../_shared/print-vibe-git-project";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-project create` */
export function registerAppsGitProjectCreateCommand(project: Command, program: Command): Command {
  const leaf = project
    .command("create <name>")
    .description("Create a standalone git project (no app attached)")
    .option("--description <text>", "Human-readable description of the project.")
    .option("--default-branch <branch>", 'Branch the repo is created with (default: "main").')
    .option(
      "--git-url <url>",
      "Git remote the build executor clones (e.g. file:///path/to/repo or https://…). Normally omitted — your tenant reports its own remote once the repo materializes."
    )
    .addHelpText(
      "after",
      `
Notes:
The name is org-unique and becomes the repository name on the git host, so it
must be a lowercase slug: start with a letter, then letters / digits / hyphens,
≤ 63 characters. It is stamped at creation and stable for the project's life.

The project lands in PENDING and your tenant materializes the repository
shortly after; "get" shows it flip to READY. (A project only materializes once
your tenant's git host is healthy — until then it simply stays PENDING.)

That repository is created SEEDED — it carries an initial commit before you
push anything — so a first push from a local repo you started yourself is
rejected with a bare "fetch first". Clone the project instead, or rebase your
local work onto it; the command's output prints both forms.

The name is taken within your org while the project lives, so creating a second
project by that name returns 409 — as does an app trying to provision its own
repo under it. Release the name with "git-project delete" when you no longer
need the project.

Examples:
  $ nexus apps git-project create shared-lib
  $ nexus apps git-project create shared-lib --description "Shared helpers" --default-branch trunk
`
    )
    .action(
      async (
        name: string,
        cmdOpts: { description?: string; defaultBranch?: string; gitUrl?: string }
      ) => {
        try {
          const opts = resolveTenantOpts(program);
          const data = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
            method: "POST",
            path: "/api/vibe/git-projects",
            body: {
              name,
              description: cmdOpts.description,
              defaultBranch: cmdOpts.defaultBranch,
              gitRemoteUrl: cmdOpts.gitUrl
            }
          });
          printVibeGitProject(data.gitProject, { freshlyProvisioned: true });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
