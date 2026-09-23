import { NexusApiError } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { color, isJsonMode } from "../../../output";
import { tenantRequest } from "../../../util/tenant-http";
import {
  type GetApprovalResponse,
  type GetDeploymentResponse,
  type SingleVibeAppResponse
} from "../../../vibe-wire-types";
import { reportWatchOutcome } from "../watch/report-watch-outcome";
import { watchDeployment } from "../watch/watch-deployment";
import { WATCH_DEFAULTS } from "../watch/watch-options";
import { resolveTenantOpts } from "./resolve-tenant-opts";

/**
 * Drive {@link watchDeployment} against the live API and render the result.
 * Shared by `deploy --watch` and `rollback --watch` — they watch the same thing
 * (one deployment becoming the served version), so they must agree on what
 * counts as success down to the exit code.
 */
export async function runDeploymentWatch(
  program: Command,
  appId: string,
  deploymentId: string
): Promise<number> {
  const opts = resolveTenantOpts(program);
  const outcome = await watchDeployment(
    {
      readDeployment: async () => {
        const data = await tenantRequest<GetDeploymentResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}`
        });
        return data.deployment;
      },
      readApp: async () => {
        const data = await tenantRequest<SingleVibeAppResponse>(opts, {
          method: "GET",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}`
        });
        return data.app;
      },
      // 404 here means the deployment is UNGATED — the endpoint answers 404 for
      // "no approval request", which is a fact, not a failure. Any other error
      // propagates: a watch that silently treats a broken read as "no gate"
      // would wait out a rejection it could have reported.
      readApproval: async () => {
        try {
          const data = await tenantRequest<GetApprovalResponse>(opts, {
            method: "GET",
            path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/approval`
          });
          return { status: data.request.status };
        } catch (err) {
          if (err instanceof NexusApiError && err.status === 404) return null;
          throw err;
        }
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now()
    },
    WATCH_DEFAULTS,
    // Progress goes to STDERR so `--json` stdout stays a single parseable
    // document; a watch that interleaves status lines into it is unpipeable.
    (status) => {
      if (!isJsonMode()) console.error(color.dim(`  … ${status}`));
    }
  );
  return reportWatchOutcome(outcome, appId);
}
