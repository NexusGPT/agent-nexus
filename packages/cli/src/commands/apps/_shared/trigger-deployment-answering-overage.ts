import { reportFailure } from "../../../errors";
import { isJsonMode } from "../../../output";
import { type TenantHttpOptions, tenantRequest } from "../../../util/tenant-http";
import { type TriggerDeploymentResponse } from "../../../vibe-wire-types";
import { confirmOverageInteractively } from "./confirm-overage-interactively";
import { printTriggeredDeployment } from "./print-triggered-deployment";

/**
 * Trigger a deployment and carry the org's spend question through to an answer.
 *
 * Returns the CREATED deployment, or `null` when nothing was created — the
 * caller exits non-zero on `null` and has nothing to watch. A scripted deploy
 * that stops while reporting success is worse than any refusal, so "the user
 * declined", "there was no TTY to ask" and "the org's state moved mid-flight"
 * all collapse to the same `null`.
 *
 * This exists as ONE function because there are two verbs that trigger a
 * deployment — `deploy --sha` and `rollback --to` — and the second was written
 * as a partial copy of the first that dropped the y/N prompt and the
 * `--confirm-overage` re-run hint entirely. A TTY user rolling back never got
 * asked, and a script never got told how to answer, while the help text
 * promised the path was exactly like `deploy --sha`. A second copy of a flow
 * is a second place for it to be incomplete.
 *
 * `rerun` is passed in rather than composed here for the same reason: the hint
 * has to name the command the operator actually ran, and a hardcoded
 * `nexus apps deploy …` printed at someone running `rollback` is a wrong
 * instruction, not a missing one.
 */
export async function triggerDeploymentAnsweringOverage(
  opts: TenantHttpOptions,
  appId: string,
  triggerSha: string,
  rerun: string,
  confirmedUpfront: boolean,
  forceRebuild = false,
  skipVerification = false
): Promise<Extract<TriggerDeploymentResponse, { status: "created" | "reused" }> | null> {
  const send = async (confirmOverage: boolean): Promise<TriggerDeploymentResponse> =>
    tenantRequest<TriggerDeploymentResponse>(opts, {
      method: "POST",
      path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments`,
      // `forceRebuild` and `skipVerification` ride EVERY send, including the
      // post-confirmation one: the re-send is the SAME request answered, so
      // dropping either there would silently change what the operator asked
      // for — a reused image they wanted replaced, or a deploy refused by a
      // gate they had already chosen to pass.
      body: { triggerSha, confirmOverage, forceRebuild, skipVerification }
    });

  let data = await send(confirmedUpfront);

  if (data.status === "confirmation_required") {
    const answered = await confirmOverageInteractively(data, rerun);
    if (!answered) return null;
    data = await send(true);
    // A confirmed re-send that still asks means the org's state moved
    // mid-flight. Nothing was created, so this must not exit clean.
    if (data.status === "confirmation_required") {
      // The same rule as the first ask, one layer down: a confirmed re-send that
      // is refused AGAIN created nothing, so under --json it owes an error
      // document rather than the payload of the thing that did not happen.
      if (isJsonMode()) {
        reportFailure(
          "remote-error",
          `Spend confirmation required again — nothing was deployed. ${data.reason.message}`,
          `Cost-safety status: ${data.reason.costSafetyStatus}\n  The organization's spend state moved mid-flight. Re-run: ${rerun}`
        );
      } else {
        printTriggeredDeployment(data, appId);
      }
      return null;
    }
  }

  return data;
}
