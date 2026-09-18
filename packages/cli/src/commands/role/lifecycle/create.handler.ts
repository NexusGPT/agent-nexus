import type { CreateRoleBody, CreateRoleResult, NexusClient } from "@agent-nexus/sdk";

import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { requireAll } from "../_shared/require-all";

/** The options `nexus role create` declares, as commander hands them to the action. */
export interface RoleCreateOptions {
  name?: string;
  owner?: string;
  jobDescription?: string;
  body?: string;
}

/**
 * Merges `--body` with the flags, refuses a missing name or owner naming both
 * paths, and creates the Role — or files the request to create it.
 */
export async function createRole(
  client: NexusClient,
  opts: RoleCreateOptions
): Promise<CreateRoleResult> {
  const base = await resolveBody(opts.body);
  const body = mergeBodyWithFlags(base, {
    name: opts.name,
    ownerUserId: opts.owner,
    jobDescription: opts.jobDescription
  });
  requireAll(
    body,
    [
      { field: "name", flag: "name" },
      // The body key is `ownerUserId`; the option is `--owner`.
      { field: "ownerUserId", flag: "owner" }
    ],
    "Pass each as a flag, or as a field of --body — the body keys are name and ownerUserId."
  );
  return client.roles.create(asRequestBody<CreateRoleBody>(body));
}
