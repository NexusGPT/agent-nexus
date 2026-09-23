import type { Command } from "commander";

import { isJsonMode } from "../../../output";
import { type TenantHttpOptions } from "../../../util/tenant-http";
import { printTriggeredDeployment } from "../_shared/print-triggered-deployment";
import { runDeploymentWatch } from "../_shared/run-deployment-watch";
import { triggerDeploymentAnsweringOverage } from "../_shared/trigger-deployment-answering-overage";

/**
 * `rollback --to <sha>`: an ordinary build+deploy of that commit.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS IS NOT A ROLLBACK. IT SHARES A COMMAND NAME WITH ONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It sits beside `restoreRollbackVersion` under one verb because an operator
 * reaches for both while an app is down, and for no other reason. They agree on
 * nothing a caller can observe:
 *
 *   | | this | `restore-version.handler.ts` |
 *   |---|---|---|
 *   | endpoint      | `POST …/deployments` | `POST …/rollback` |
 *   | spends a version number | yes | no |
 *   | builds        | yes | no |
 *   | atomic        | no  | yes |
 *   | ship gate     | applies, `--skip-verification` bypasses it | never reached |
 *   | overage ask   | applies, `--confirm-overage` answers it | never reached |
 *
 * They were one file until the split, and a shared file is what let the
 * differences read as variants of one operation. `rollback.command.ts`'s help
 * text has said `--to <sha> IS A DIFFERENT OPERATION wearing the same name`
 * since it was written; this is the code agreeing with it.
 */
export async function redeployShaForRollback(
  program: Command,
  opts: TenantHttpOptions,
  appId: string,
  cmdOpts: { to?: string; confirmOverage?: boolean; watch?: boolean; skipVerification?: boolean },
  triggerSha: string
): Promise<void> {
  // The SAME flow `deploy --sha` runs, not a copy of it — including
  // the y/N spend prompt and the re-run hint, which a partial copy
  // here silently dropped. The hint names `rollback --to`, because
  // telling someone to re-run `deploy` is a wrong instruction.
  const data = await triggerDeploymentAnsweringOverage(
    opts,
    appId,
    triggerSha,
    `nexus apps rollback ${appId} --to ${cmdOpts.to}` +
      `${cmdOpts.skipVerification === true ? " --skip-verification" : ""}` +
      ` --confirm-overage`,
    cmdOpts.confirmOverage === true,
    // forceRebuild, hardcoded false: `rollback` exposes no `--force-rebuild`,
    // so this path always deploys the image the registry already holds for the
    // sha. That is right for the case the flag exists for — the sha built
    // cleanly and a LATER version broke — and it is the one thing `deploy --sha`
    // can do that this cannot. A sha whose IMAGE is the defect is not
    // recoverable here at any flag combination; it needs
    // `deploy --sha <sha> --force-rebuild`.
    false,
    // A `--to` rollback is an ordinary redeploy, so it meets the ship
    // gate like any other. Exposed here because the commit being
    // rolled BACK to is old and may predate the artifacts the app now
    // requires — refusing the recovery lever during an incident is
    // the wrong failure. The plain `rollback` (no --to) restores a
    // SUPERSEDED deployment without a build and never meets the gate
    // at all.
    cmdOpts.skipVerification === true
  );
  if (data === null) {
    process.exitCode = 1;
    return;
  }
  // Same single-document rule as `deploy --watch`; see there.
  const watchingRedeploy = cmdOpts.watch === true;
  if (!watchingRedeploy || !isJsonMode()) printTriggeredDeployment(data, appId);
  if (watchingRedeploy) {
    process.exitCode = await runDeploymentWatch(program, appId, data.deployment.id);
  }
}
