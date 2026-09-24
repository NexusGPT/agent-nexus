/**
 * THE DRIFT GATE for `vibe-deployment-wire-types.ts`.
 *
 * Same mechanism, same vocabulary as `vibe-wire-types.conformance.ts`: every
 * assertion is a `const` whose declared type is `true` only while the CLI's
 * hand-declared shape matches the endpoint contract, so `pnpm typecheck` fails
 * — naming the field — the day one of them drifts. Compiled, never executed,
 * and unreachable from `src/index.ts`.
 */

/**
 * The whole module as a TYPE namespace, so the contract's status unions can be
 * read in type position without importing a value — the bundle gate admits
 * `@nexus/types` here and nowhere a published module can reach.
 */
import type * as NexusTypes from "@nexus/types";

import type { WatchDeploymentStatus } from "./commands/apps/watch/watch-deployment-status";
import type {
  VibeBuildJobDto,
  VibeBuildJobStatus,
  VibeDeploymentDisplacerDto,
  VibeDeploymentDto
} from "./vibe-deployment-wire-types";
import {
  AGREES,
  type Mirrors,
  type SameMembers,
  type VibeData
} from "./vibe-wire-vocabulary.conformance";

type WireDeployment = VibeData<"GetDeployment">["deployment"];

/**
 * `organizationId` and `updatedAt` are on every row and are never rendered — the org is
 * the API key's, and a deployment is immutable after its terminal status. `shipGateMode`
 * is the app's setting captured on the row, printed by neither. `triggerSource`,
 * `createdByUserId` and `createdByName` are the console's "who shipped this" column;
 * the CLI's caller is the person asking.
 */
const _deployment: Mirrors<
  "VibeDeploymentDto",
  VibeDeploymentDto,
  WireDeployment,
  | "organizationId"
  | "triggerSource"
  | "shipGateMode"
  | "createdByUserId"
  | "createdByName"
  | "updatedAt"
> = AGREES;

type WireBuildJob = NonNullable<VibeData<"GetDeployment">["buildJob"]>;

/** Same two as the deployment above, for the same two reasons. */
const _buildJob: Mirrors<
  "VibeBuildJobDto",
  VibeBuildJobDto,
  WireBuildJob,
  "organizationId" | "updatedAt"
> = AGREES;

const _deploymentDisplacer: Mirrors<
  "VibeDeploymentDisplacerDto",
  VibeDeploymentDisplacerDto,
  NonNullable<WireDeployment["displacedBy"]>
> = AGREES;

/**
 * The two status vocabularies `colorizeStatus` keys its exhaustive Record by.
 * The DTOs hold `status: string` on purpose (see `VibeBuildJobStatus`), so
 * nothing about a shape comparison can see a status added upstream. The
 * membership itself has to be asserted. Without this, a new status compiles
 * clean and prints in no colour at all.
 */
const _deploymentStatuses: SameMembers<
  "WatchDeploymentStatus",
  WatchDeploymentStatus,
  NexusTypes.VibeDeploymentStatusValue
> = true;

const _buildJobStatuses: SameMembers<
  "VibeBuildJobStatus",
  VibeBuildJobStatus,
  NexusTypes.VibeBuildJobStatusValue
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist.
 */
export const VIBE_DEPLOYMENT_WIRE_TYPES_CONFORM = [
  _deployment,
  _buildJob,
  _deploymentDisplacer,
  _deploymentStatuses,
  _buildJobStatuses
] as const;
