/**
 * THE DRIFT GATE for `vibe-app-envelope-wire-types.ts` — what each app route
 * answers with, and the joins that ride beside the app rather than on it.
 *
 * Same mechanism as `vibe-wire-types.conformance.ts`, whose header owns it in
 * full, including why `VibeData` is RE-DECLARED here rather than taken from
 * `vibe-wire-vocabulary.conformance.ts`.
 *
 * `_deployabilities` lives here and not beside `VibeAppDeployability`'s own
 * declaration: the type is the app's, and the FIELD is the envelope's, so the
 * contract side of the comparison only exists on this surface.
 */

import type { TApi } from "@nexus/types";

import type {
  CreateVibeAppResponse,
  GetVibeAppResponse,
  ListVibeAppsResponse,
  SingleVibeAppResponse,
  VibeAppGitProjectSummaryDto
} from "./vibe-app-envelope-wire-types";
import type { VibeAppDeployability } from "./vibe-app-wire-types";
import type { Listed, SameMembers, VibeEnvelopedOp } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

/**
 * The list read carries two deployment summaries the CLI does not render — see
 * `VibeAppListItemDto`, which documents why `vibe deployments list` is the
 * command that answers "is it serving".
 *
 * `shipGateMode` is NOT omitted here, because `VibeAppListItemDto` is
 * `VibeAppDto & VibeAppEnvelopeExtras` and inherits it. The list table still
 * prints no gate column — mirroring a field is not rendering it — but the
 * omission line had to go, and this gate is what said so rather than a reader.
 *
 * `createdBy` is the creator SUMMARY the console's Owner column reads, and it
 * is omitted rather than mirrored because the CLI already prints the fact it
 * carries: `VibeAppDto.createdByUserId` is mirrored, and the two are the same
 * attribution at different resolutions. Mirroring the summary as well would
 * invite a second, name-shaped ownership column in a table that is already
 * wide, and composing a display name is a rendering decision this package has
 * not made. The id is what a CLI user pipes into another command; the name is
 * what a grid renders.
 *
 * `deploymentHistory` is omitted for the reason the two deployment summaries
 * are, one step further: it is a bounded WINDOW plus a set of counts, and
 * `vibe deployments list` already prints every attempt at full fidelity with
 * nothing dropped and nothing classified. Mirroring a truncated twelve beside
 * it would put a second, lossier history surface in the same binary — and the
 * counts carry a judgement (`vibeDeploymentOutcome`, which reads a rolled-back
 * version as failed) that a table printing raw statuses deliberately does not
 * make. A grid draws twelve ticks because that is what fits; a terminal has the
 * whole list.
 */
const _appListItem: Mirrors<
  "VibeAppListItemDto",
  ListVibeAppsResponse["apps"][number],
  VibeData<"ListApps">["apps"][number],
  | "icon"
  | "linkedToolId"
  | "latestDeployment"
  | "servingDeployment"
  | "createdBy"
  | "deploymentHistory"
> = AGREES;

const _getApp: Mirrors<"GetVibeAppResponse", GetVibeAppResponse, VibeData<"GetApp">> = AGREES;

const _createApp: Mirrors<
  "CreateVibeAppResponse",
  CreateVibeAppResponse,
  VibeData<"CreateApp">
> = AGREES;

const _updateApp: Mirrors<
  "SingleVibeAppResponse",
  SingleVibeAppResponse,
  VibeData<"UpdateApp">
> = AGREES;

const _deployabilities: SameMembers<
  "VibeAppDeployability",
  VibeAppDeployability,
  Listed<VibeData<"GetApp">["deployability"]>
> = true;

const _gitProjectSummary: Mirrors<
  "VibeAppGitProjectSummaryDto",
  VibeAppGitProjectSummaryDto,
  NonNullable<VibeData<"GetApp">["gitProject"]>
> = AGREES;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_APP_ENVELOPE_WIRE_TYPES_CONFORM = [
  _appListItem,
  _getApp,
  _createApp,
  _updateApp,
  _deployabilities,
  _gitProjectSummary
] as const;
