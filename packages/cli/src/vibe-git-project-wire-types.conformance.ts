/**
 * THE DRIFT GATE for `vibe-git-project-wire-types.ts` — the git project, its
 * deprecated `repository` alias, and the per-project push credential.
 *
 * Same mechanism as `vibe-wire-types.conformance.ts`, whose header owns it in
 * full, including why `VibeData` is RE-DECLARED here rather than taken from
 * `vibe-wire-vocabulary.conformance.ts`.
 */

import type { TApi } from "@nexus/types";

import type {
  GetGitProjectCredentialsResponse,
  ListVibeGitProjectsResponse,
  SingleVibeGitProjectResponse,
  StandaloneVibeGitProjectResponse,
  VibeGitProjectAliasDto,
  VibeGitProjectCredentialsDto,
  VibeGitProjectDto
} from "./vibe-git-project-wire-types";
import type { VibeEnvelopedOp } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

/**
 * A FULL mirror, despite the "Subset of VibeGitProjectSchema" the declaration used to
 * carry: the wire shape has twelve fields and the CLI declares all twelve. The comment
 * was wrong in the direction that costs — it invited a reader to assume a missing field
 * was a deliberate omission rather than drift, which is exactly the reasoning this file
 * exists to replace.
 */
type WireGitProject = VibeData<"GetGitProjectById">["gitProject"];

const _gitProject: Mirrors<"VibeGitProjectDto", VibeGitProjectDto, WireGitProject> = AGREES;

const _standaloneGitProject: Mirrors<
  "StandaloneVibeGitProjectResponse",
  StandaloneVibeGitProjectResponse,
  VibeData<"GetGitProjectById">
> = AGREES;

/**
 * The app-scoped read still carries the deprecated `repository` alias beside the
 * canonical key, so both are asserted — `gitProject` optional, `repository` a PARTIAL
 * project. Typing the alias as a full project was a lie the printer could have rendered
 * as `undefined`; see {@link VibeGitProjectAliasDto}.
 */
const _appScopedGitProject: Mirrors<
  "SingleVibeGitProjectResponse",
  SingleVibeGitProjectResponse,
  VibeData<"GetGitProject">
> = AGREES;

const _gitProjectAlias: Mirrors<
  "VibeGitProjectAliasDto",
  VibeGitProjectAliasDto,
  VibeData<"GetGitProject">["repository"]
> = AGREES;

const _listGitProjects: Mirrors<
  "ListVibeGitProjectsResponse",
  ListVibeGitProjectsResponse,
  VibeData<"ListGitProjects">
> = AGREES;

const _gitProjectCredentials: Mirrors<
  "VibeGitProjectCredentialsDto",
  VibeGitProjectCredentialsDto,
  VibeData<"GetGitProjectCredentials">["credentials"]
> = AGREES;

const _getGitProjectCredentials: Mirrors<
  "GetGitProjectCredentialsResponse",
  GetGitProjectCredentialsResponse,
  VibeData<"GetGitProjectCredentials">
> = AGREES;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_GIT_PROJECT_WIRE_TYPES_CONFORM = [
  _gitProject,
  _standaloneGitProject,
  _appScopedGitProject,
  _gitProjectAlias,
  _listGitProjects,
  _gitProjectCredentials,
  _getGitProjectCredentials
] as const;
