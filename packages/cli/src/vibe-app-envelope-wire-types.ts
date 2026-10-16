/**
 * THE APP ENVELOPES — what each app route answers with, as opposed to the app
 * itself, which is `vibe-app-wire-types.ts`.
 *
 * Split out of `vibe-wire-types.ts`, which re-exports every name below, so no
 * import site moved. Re-declared rather than imported for the reason that file
 * gives: the CLI ships standalone and `@nexus/types` is not a runtime
 * dependency. `vibe-app-envelope-wire-types.conformance.ts` is the gate.
 */

import type { VibeAppDeployability, VibeAppDto } from "./vibe-app-wire-types";
import type { VibeUnlistedValue } from "./vibe-deploy-state-vocabulary";

/**
 * A reference to one git project, as the app envelopes carry it. Mirrors
 * `VibeAppGitProjectSummarySchema`, which is the single backend shape behind
 * BOTH uses: the project attached to an app (`GetApp`), and the project that
 * already holds a name a new app wanted (`CreateApp`).
 */
export interface VibeAppGitProjectSummaryDto {
  id: string;
  name: string;
  status: string;
}

/**
 * `deployability` and `gitProject` sit BESIDE the app on every envelope that
 * carries them, never on the app itself — deliberately, per
 * `GetVibeAppResponseSchema`'s own comment: they are a join, and putting them
 * on the app would oblige every producer of a `VibeApp` (including create,
 * which has no project yet) to resolve one.
 *
 * So they are mixed in HERE rather than added to {@link VibeAppDto}, and the
 * printer takes them as a separate argument.
 */
export interface VibeAppEnvelopeExtras {
  deployability: VibeAppDeployability | VibeUnlistedValue;
  gitProject: VibeAppGitProjectSummaryDto | null;
}

/**
 * The list read carries the extras per item, because the grid must be able to
 * mark an app that will never build without an N+1 of git-project fetches.
 */
export type VibeAppListItemDto = VibeAppDto & VibeAppEnvelopeExtras;

export interface ListVibeAppsResponse {
  apps: VibeAppListItemDto[];
}

/**
 * Just the app — `UpdateVibeAppResponseSchema` exactly, and the base that
 * CREATE and GET each extend in their own direction.
 *
 * Neither of those extensions carries `deployability`: create has no project
 * yet, and update does not resolve one. Typing them as the richer get-response
 * below would be a lie the CLI could then print as `undefined`.
 */
export interface SingleVibeAppResponse {
  app: VibeAppDto;
}

/** `GET /api/vibe/apps/:id` — the app PLUS the joins only this read resolves. */
export type GetVibeAppResponse = SingleVibeAppResponse & VibeAppEnvelopeExtras;

/**
 * `app create`'s response. Mirrors `CreateVibeAppResponseSchema` — the same
 * app, plus a warning the plain single-app reads have no reason to carry.
 */
export interface CreateVibeAppResponse extends SingleVibeAppResponse {
  /**
   * A live git project in the org that already goes by this app's name. The app
   * was still created — this is a heads-up that `provision-repo` will 409 on
   * that name, and that `attach-repo` is what the caller almost certainly wants
   * instead.
   *
   * Optional as well as nullable: a published CLI outlives the backend release
   * it was built against, so an older server omits the key entirely. Absent and
   * `null` both mean "no collision", and the print site treats them alike.
   */
  gitProjectNameCollision?: VibeAppGitProjectSummaryDto | null;
}
