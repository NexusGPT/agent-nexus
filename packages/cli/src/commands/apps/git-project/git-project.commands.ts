import type { Command } from "commander";

import { registerAppsGitProjectCloneCommand } from "./clone.command";
import { registerAppsGitProjectCreateCommand } from "./create.command";
import { registerAppsGitProjectDeleteCommand } from "./delete.command";
import { registerAppsGitProjectGetCommand } from "./get.command";
import { registerAppsGitProjectListCommand } from "./list.command";
import { registerAppsGitProjectPullCommand } from "./pull.command";
import { registerAppsGitProjectReprovisionCommand } from "./reprovision.command";

/** Registers every `nexus apps git-project` leaf, in registration order. */
export function registerAppsGitProjectCommands(apps: Command, program: Command): void {
  const project = apps
    .command("git-project")
    .description("Manage git projects — the standalone code store apps deploy from")
    .addHelpText(
      "after",
      `
Notes:
A git project is the git primitive: an org-scoped code store materialized as
a repository on your tenant's git host. It stands on its own — a project with
no app attached is a pure code store. Push to it and its refs advance; nothing
deploys, because deployment is an app's job.

Apps point at a project ("many apps → one project"), so one code store can
back several apps watching different branches. "nexus apps provision-repo"
is the app-centric shortcut that creates a project and attaches it in one step.

"clone" and "pull" drive a real git on this machine, so a project is usable
end-to-end from the CLI: clone it, commit, push with the remote that
"git-credentials" prints, then pull the next change back.

Examples:
  $ nexus apps git-project create my-lib
  $ nexus apps git-project list
  $ nexus apps git-project get 11111111-2222-4333-8444-555555555555
  $ nexus apps git-project clone 11111111-2222-4333-8444-555555555555 ./my-lib
  $ nexus apps git-project pull 11111111-2222-4333-8444-555555555555 ./my-lib
  $ nexus apps git-project delete 11111111-2222-4333-8444-555555555555
`
    );

  registerAppsGitProjectCreateCommand(project, program);
  registerAppsGitProjectListCommand(project, program);
  registerAppsGitProjectGetCommand(project, program);
  registerAppsGitProjectCloneCommand(project, program);
  registerAppsGitProjectPullCommand(project, program);
  registerAppsGitProjectReprovisionCommand(project, program);
  registerAppsGitProjectDeleteCommand(project, program);
}
