import type { VibeUnlistedValue } from "./vibe-deploy-state-vocabulary";

/**
 * THE GIT PROJECT — the repository an app builds from, its deprecated alias,
 * and the per-project push credential.
 *
 * Split out of `vibe-wire-types.ts`, which re-exports every name below, so no
 * import site moved. Re-declared rather than imported for the reason that file
 * gives: the CLI ships standalone and `@nexus/types` is not a runtime
 * dependency. `vibe-git-project-wire-types.conformance.ts` is the gate.
 */

/** Mirrors `VibeGitProjectSchema` in full — thirteen fields, all thirteen declared. */
export interface VibeGitProjectDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  s3Prefix: string;
  hookSecretRef: string;
  /**
   * What the build executor clones — NEVER a push URL, so don't label it
   * "Git URL": a user's push remote comes from
   * `nexus apps git-credentials <projectId>`, whose `cloneUrl` is the public
   * `https://git.<tenant>.<domain>/<org>/<name>.git`.
   *
   * Its reachability varies by provenance, so don't assert one: when the agent
   * materializes the repo it composes this from Forgejo's in-VPC baseUrl
   * (unreachable from a user's machine — the web console refuses to render it
   * for exactly that reason), but `--git-url` on provision sets it to whatever
   * the user supplied, which per schema.prisma's `VibeGitProject.gitRemoteUrl`
   * comment may be a local path, `file://`, or a public https URL.
   *
   * Null whenever `gitRemoteState` is not `available` — including while the
   * tenant's git host has no live address, when the backend withholds the URL
   * rather than answer with the host's last, possibly reassigned, IP.
   */
  gitRemoteUrl: string | null;
  /**
   * Why `gitRemoteUrl` is or is not set. Absent only from a backend that
   * predates it; a state a newer backend adds arrives as the server's word.
   */
  gitRemoteState?: "available" | "none" | "git_host_unavailable" | VibeUnlistedValue;
  status: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The deprecated `repository` alias, which is NOT the full project.
 *
 * `VibeGitProjectEnvelopeSchema` declares it with `name`, `description` and
 * `defaultBranch` optional, and this file typed all three as required until the
 * conformance gate compared the two. Nothing crashed, because the printer reads
 * `data.gitProject ?? data.repository` and the canonical key is present on every
 * backend that still ships — but on the pre-decoupling response the fallback was the
 * only value available, and three fields it promised could be absent. A promise a
 * response cannot keep prints `undefined` and reads as a value.
 */
export type VibeGitProjectAliasDto = Omit<
  VibeGitProjectDto,
  "name" | "description" | "defaultBranch"
> &
  Partial<Pick<VibeGitProjectDto, "name" | "description" | "defaultBranch">>;

export interface SingleVibeGitProjectResponse {
  /** Canonical key; absent only on a pre-decoupling backend. */
  gitProject?: VibeGitProjectDto;
  /** Deprecated alias — always present, read as the fallback. */
  repository: VibeGitProjectAliasDto;
}

/**
 * The standalone git-project routes are greenfield — they postdate the
 * decoupling, so no pre-decoupling backend serves them and the deprecated
 * `repository` alias key never appears. `gitProject` is always present.
 */
export interface StandaloneVibeGitProjectResponse {
  gitProject: VibeGitProjectDto;
}

export interface ListVibeGitProjectsResponse {
  gitProjects: VibeGitProjectDto[];
}

// Per-project git credential (`VibeGitProjectCredentialsSchema`), pinned by the conformance file.
export interface VibeGitProjectCredentialsDto {
  gitProjectId: string;
  gitProjectName: string;
  gitHostName: string;
  forgejoOrg: string;
  username: string;
  pushToken: string;
  cloneUrl: string;
}

export interface GetGitProjectCredentialsResponse {
  credentials: VibeGitProjectCredentialsDto;
}
