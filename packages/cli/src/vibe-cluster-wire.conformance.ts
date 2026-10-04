/**
 * THE DRIFT GATE for `commands/apps/_shared/vibe-cluster-wire.ts`.
 *
 * The CLI cannot import `@nexus/types` at runtime (it publishes standalone), so
 * the tenant-cluster read is hand-declared. Without this gate the copy kept a
 * field the server stopped sending and printed it as a dash forever; with it, a
 * field added, removed or renamed upstream is a compile error here.
 *
 * Compiled, never bundled: `src/index.ts` cannot reach this module.
 *
 * The cluster is compared against the DTO the server's own schema infers, and
 * the response against the `GetCluster` envelope — two readings of one contract,
 * so a drift between the schema and the route that serves it reds here too.
 */
import type * as NexusTypes from "@nexus/types";

import type {
  GetVibeClusterResponse,
  VibeClusterConditionDto,
  VibeClusterHealthDto
} from "./commands/apps/_shared/vibe-cluster-wire";
import { type VibeData } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

type WireCluster = Wire<NexusTypes.VibeClusterHealthDto>;

const _cluster: Mirrors<"VibeClusterHealthDto", VibeClusterHealthDto, WireCluster> = AGREES;

/** `kind` is wider (`string`) here on purpose — see the declaration. */
const _condition: Mirrors<
  "VibeClusterConditionDto",
  VibeClusterConditionDto,
  WireCluster["condition"]
> = AGREES;

const _response: Mirrors<
  "GetVibeClusterResponse",
  GetVibeClusterResponse,
  VibeData<"GetCluster">
> = AGREES;

/** Compiled, never executed; the export keeps `noUnusedLocals` off the assertions. */
export const VIBE_CLUSTER_WIRE_CONFORMS = [_cluster, _condition, _response] as const;
