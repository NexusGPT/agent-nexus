import {
  type MintWorkspaceMountCredentialsBody,
  NexusApiError,
  type WorkspaceMountCredentials
} from "@agent-nexus/sdk";

import { CategorizedCliError, categoryForHttpStatus } from "../../exit-codes";
import type { DirectMountRequest } from "../../workspace-direct-mount/direct-mount-request";
import { mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { GATEWAY_FALLBACK_FOR } from "./platform-rules";

/**
 * The key request is the direct engine's alone; the gateway makes none. A
 * server that refuses it — no sandbox role on the deployment, a key kind it
 * denies, an older server without the route — is reported with its own status,
 * code and message, plus the one thing to type. Never a second engine started
 * on the person's behalf: the owner's rule for a failure after the plan.
 * A connection failure is not a refusal and passes through as it is.
 */
export async function mintOrRefuse(
  request: DirectMountRequest,
  body: MintWorkspaceMountCredentialsBody
): Promise<WorkspaceMountCredentials> {
  try {
    return await request.client.workspaces.mintMountCredentials(request.slug, body);
  } catch (error) {
    if (!(error instanceof NexusApiError)) throw error;
    const gateway = GATEWAY_FALLBACK_FOR[mountPlatformOf(process.platform)];
    throw new CategorizedCliError(
      categoryForHttpStatus(error.status),
      error.code,
      `The server refused the direct engine's key request (${String(error.status)}): ${error.message}`,
      `Mount with --engine ${gateway} instead: the gateway makes no key request.`
    );
  }
}
