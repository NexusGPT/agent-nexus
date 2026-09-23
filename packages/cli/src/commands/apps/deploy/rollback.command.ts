import type { Command } from "commander";

import { handleError, refuse } from "../../../errors";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { resolveTriggerSha } from "../_shared/resolve-trigger-sha";
import { parseTargetVersion } from "../rollback-target/parse-target-version";
import { redeployShaForRollback } from "./redeploy-sha.handler";
import { restoreRollbackVersion } from "./restore-version.handler";

const ROLLBACK_HELP = `
Notes:
THREE OPERATIONS WEAR THIS ONE NAME. Which you get depends on the flag:

  rollback <appId>                   restore the version before this one
  rollback <appId> --to-version <n>  restore a SPECIFIC earlier version
  rollback <appId> --to <sha>        BUILD AND DEPLOY a commit again

THE FIRST TWO ARE THE SAME OPERATION and differ only in which version they
name. Both are NON-DESTRUCTIVE and delete nothing: the server re-activates
an already-built SUPERSEDED deployment and its retained image in one atomic
transaction, onto the slot opposite the current one. Nothing is rebuilt, no
new version number is spent, and the version serving now keeps every request
until the restored one is healthy — so availability never regresses.

--to-version takes the number in the Version column of
"apps deployments list"; 7 and v7 are the same argument. It is resolved to
the one deployment carrying that version before anything is sent, and the
command REFUSES rather than guessing when that version is missing, is the
one already serving, or never served. Only a SUPERSEDED version can be
restored — a version that failed or was displaced kept no usable image, and
the refusal names the commit to redeploy instead.

--to <sha> IS A DIFFERENT OPERATION wearing the same name, and is offered
because it is what you reach for when every earlier version is also bad: it
triggers an ordinary build+deploy of that sha, exactly like \`deploy --sha\`.
It is NOT atomic, it REBUILDS, and it spends a new version number. Prefer
--to-version whenever the version you want is still in the listing.

--to and --to-version cannot be combined: they are two different operations
and there is no correct way to do both.

409 means there is nothing to roll back to — no live version, no previous
version, or a deploy already in flight.

Examples:
  $ nexus apps rollback 11111111-2222-4333-8444-555555555555
  $ nexus apps rollback 11111111-2222-4333-8444-555555555555 --watch
  $ nexus apps rollback 11111111-2222-4333-8444-555555555555 --to-version 7
  $ nexus apps rollback 11111111-2222-4333-8444-555555555555 --to-version v7 --watch
  $ nexus apps rollback 11111111-2222-4333-8444-555555555555 --to 1a2b3c4
`;

/** `nexus apps rollback` */
export function registerAppsRollbackCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("rollback <appId>")
    .description("Roll an app back to its previous healthy version")
    .option(
      "--to-version <n>",
      "Restore this version number instead of the previous one. Atomic, no rebuild."
    )
    .option("--to <sha>", "Redeploy this specific commit sha instead of the previous version.")
    .option(
      "--skip-verification",
      "With --to: ship even though the app requires its verification artifacts to be green."
    )
    .option(
      "--confirm-overage",
      "Only with --to: confirm the redeploy may exceed the org's usage soft limit."
    )
    .option("--watch", "Block until the restored version is healthy AND served, then exit 0.")
    .addHelpText("after", ROLLBACK_HELP)
    .action(
      async (
        appId: string,
        cmdOpts: {
          to?: string;
          toVersion?: string;
          confirmOverage?: boolean;
          watch?: boolean;
          skipVerification?: boolean;
        }
      ) => {
        try {
          const opts = resolveTenantOpts(program);

          // Refused rather than given a precedence, because there is no
          // precedence that is not a wrong guess: one restores an existing
          // version without building, the other builds a commit and spends a
          // new version number. Silently honouring either would perform an
          // operation the operator did not ask for, and the two differ in
          // whether an app gets rebuilt.
          if (cmdOpts.to !== undefined && cmdOpts.toVersion !== undefined) {
            process.exitCode = refuse(
              "--to and --to-version are different operations, so they cannot be combined.",
              "--to-version restores an already-built version and rebuilds nothing; --to builds and deploys a commit again. Pass exactly one."
            );
            return;
          }

          // --to is a redeploy, not a restore: same endpoint as `deploy --sha`,
          // so it inherits the overage question and every other deploy rule
          // rather than reimplementing them here.
          if (cmdOpts.to !== undefined) {
            const triggerSha = resolveTriggerSha(cmdOpts.to, "--to");
            await redeployShaForRollback(program, opts, appId, cmdOpts, triggerSha);
            return;
          }

          // Parsed here, before any request: a malformed --to-version is a
          // defect in the command line and costs no round trip to refuse.
          let version: number | null = null;
          if (cmdOpts.toVersion !== undefined) {
            version = parseTargetVersion(cmdOpts.toVersion);
            if (version === null) {
              process.exitCode = refuse(
                `Invalid --to-version "${cmdOpts.toVersion}". Expected a version number, like 7 or v7.`,
                `Run "nexus apps deployments list ${appId}" — the Version column is where these come from.`
              );
              return;
            }
          }

          await restoreRollbackVersion(program, opts, appId, version, cmdOpts.watch === true);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
