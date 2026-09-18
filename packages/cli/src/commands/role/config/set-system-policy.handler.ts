import type { NexusClient, RoleSystemPolicy, RoleSystemPolicyBody } from "@agent-nexus/sdk";

import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { readBoolean } from "../_shared/read-boolean";
import { requireAll } from "../_shared/require-all";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** The options `nexus role set-system-policy` declares, as commander hands them to the action. */
export interface RoleSetSystemPolicyOptions {
  allowProposals?: string;
  requireReview?: string;
  startPaused?: string;
  autoPush?: string;
  notifyTakeover?: string;
  body?: string;
}

/**
 * Resolves the Role, merges `--body` with the five booleans — anything but
 * `true` or `false` refused — refuses a partial policy naming both paths,
 * and replaces the system policy.
 */
export async function setRoleSystemPolicy(
  client: NexusClient,
  ref: string,
  opts: RoleSetSystemPolicyOptions
): Promise<RoleSystemPolicy> {
  const roleId = await resolveRoleId(client, ref);
  const base = await resolveBody(opts.body);
  const body = mergeBodyWithFlags(base, {
    allowProposals:
      opts.allowProposals === undefined
        ? undefined
        : readBoolean(String(opts.allowProposals), "--allow-proposals"),
    requireReview:
      opts.requireReview === undefined
        ? undefined
        : readBoolean(String(opts.requireReview), "--require-review"),
    startPaused:
      opts.startPaused === undefined
        ? undefined
        : readBoolean(String(opts.startPaused), "--start-paused"),
    autoPush:
      opts.autoPush === undefined ? undefined : readBoolean(String(opts.autoPush), "--auto-push"),
    notifyTakeover:
      opts.notifyTakeover === undefined
        ? undefined
        : readBoolean(String(opts.notifyTakeover), "--notify-takeover")
  });
  requireAll(
    body,
    [
      { field: "allowProposals", flag: "allow-proposals" },
      { field: "requireReview", flag: "require-review" },
      { field: "startPaused", flag: "start-paused" },
      { field: "autoPush", flag: "auto-push" },
      { field: "notifyTakeover", flag: "notify-takeover" }
    ],
    "This route replaces the whole policy, so every flag must be sent."
  );
  return client.roles.upsertSystemPolicy(roleId, asRequestBody<RoleSystemPolicyBody>(body));
}
