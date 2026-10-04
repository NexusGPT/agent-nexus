import { type TenantHttpOptions, tenantRequest } from "../../../util/tenant-http";
import {
  type GetGitProjectCredentialsResponse,
  type VibeGitProjectCredentialsDto
} from "../../../vibe-wire-types";

/**
 * The push credential for ONE git project — the only git credential any CLI
 * command asks for.
 *
 * The org-wide token (`GET /api/vibe/git-credentials`) belongs to the platform's
 * Forgejo admin and pushes, and force-pushes, to every repository in the
 * tenant. A copy of it on a developer's machine is a copy of every repository,
 * so the backend serves it to nobody — the route answers 410 Gone — and this
 * CLI never names it. A per-project machine user can reach its own repository
 * and nothing else.
 *
 * Shared by `git-credentials`, `git-project clone` and `git-project pull`, so
 * the route and its response shape are written once.
 */
export async function fetchGitProjectCredentials(
  opts: TenantHttpOptions,
  projectId: string
): Promise<VibeGitProjectCredentialsDto> {
  const data = await tenantRequest<GetGitProjectCredentialsResponse>(opts, {
    method: "GET",
    path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}/credentials`
  });
  return data.credentials;
}
