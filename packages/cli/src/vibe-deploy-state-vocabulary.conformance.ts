/**
 * THE DRIFT GATE for `vibe-deploy-state-vocabulary.ts`.
 *
 * Same mechanism, same vocabulary as `vibe-wire-types.conformance.ts`: compiled,
 * never executed, and unreachable from `src/index.ts`, so the `@nexus/types`
 * import below never reaches the bundle.
 *
 * The renderer keys its words on the LISTED outcomes and resolutions, so the
 * CLI's lists must EQUAL the contract's — a value listed there and not here
 * would print as "not known to this CLI version" from a binary that could have
 * known it, and a value listed here and dropped there is a word nobody can
 * explain. The UNLISTED half needs no assertion of its own:
 * `vibe-wire-types.conformance.ts`'s `_deployState` already requires the wire's
 * read type to be assignable to `Listed | VibeUnlistedValue`.
 */

import type { VibeDeployStateOutcomeValue, VibeDeployStateResolvedFromValue } from "@nexus/types";

import type {
  VibeDeployStateOutcome,
  VibeDeployStateResolvedFrom
} from "./vibe-deploy-state-vocabulary";
import type { SameMembers } from "./vibe-wire-vocabulary.conformance";

const _outcomes: SameMembers<
  "VibeDeployStateOutcome",
  VibeDeployStateOutcome,
  VibeDeployStateOutcomeValue
> = true;

const _resolvedFrom: SameMembers<
  "VibeDeployStateResolvedFrom",
  VibeDeployStateResolvedFrom,
  VibeDeployStateResolvedFromValue
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist.
 */
export const VIBE_DEPLOY_STATE_VOCABULARY_CONFORMS = [_outcomes, _resolvedFrom] as const;
