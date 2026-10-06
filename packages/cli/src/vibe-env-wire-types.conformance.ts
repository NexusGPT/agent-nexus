/**
 * THE DRIFT GATE for `vibe-env-wire-types.ts` — an app's environment: its
 * plaintext variables and the access cards imported into it.
 *
 * Same mechanism and vocabulary as `vibe-wire-types.conformance.ts`, which these
 * assertions moved out of with the shapes they hold. Compiled, never executed,
 * and unreachable from `src/index.ts`.
 */

import type {
  VibeCardBindingStatusValue,
  VibeCardProjectionValue,
  VibeEnvVarScopeValue
} from "@nexus/types";

import type {
  DeleteEnvVarResponse,
  ListEnvVarsResponse,
  UpsertEnvVarResponse,
  VibeAppCardBindingDto,
  VibeAppEnvVarDto,
  VibeCardBindingStatus,
  VibeCardProjection,
  VibeEnvVarScope
} from "./vibe-env-wire-types";
import { type SameMembers, type VibeData } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors } from "./wire-conformance.types";

/**
 * `secretMaterial` is the write gate's verdict on a stored value. It is not
 * rendered because `env list` prints values, and a per-row verdict beside a
 * value the reader can see for themselves adds a column without adding a fact.
 */
const _envVar: Mirrors<
  "VibeAppEnvVarDto",
  VibeAppEnvVarDto,
  VibeData<"ListEnvVars">["envVars"][number],
  "secretMaterial"
> = AGREES;

/**
 * `cardBindings` is OPTIONAL on both sides, and the gate is what keeps it that
 * way. The CLI ships standalone and is routinely pointed at a backend older
 * than itself, so ABSENT ("this server has nothing to say about cards") is a
 * different fact from `[]` ("it does, and this app has none"). A future
 * required-ing of the wire field would land here as a mismatch rather than as a
 * CLI that silently reports every old backend's apps as holding no cards.
 */
const _listEnvVars: Mirrors<
  "ListEnvVarsResponse",
  ListEnvVarsResponse,
  VibeData<"ListEnvVars">
> = AGREES;

/**
 * The card rows `env list` renders beside the plaintext variables.
 *
 * Every field is mirrored — there is no declared omission — because each one is
 * on screen: the handle is the value the app reads, `status` and the two quota
 * fields make the Status column, and `credentialName` / `accessCardName` make
 * the Card column that says whose authority a row spends.
 *
 * `NonNullable` because the wire field is optional; the element type is what
 * the CLI models, and the optionality itself is checked by `_listEnvVars`.
 */
const _cardBinding: Mirrors<
  "VibeAppCardBindingDto",
  VibeAppCardBindingDto,
  NonNullable<VibeData<"ListEnvVars">["cardBindings"]>[number]
> = AGREES;

const _upsertEnvVar: Mirrors<
  "UpsertEnvVarResponse",
  UpsertEnvVarResponse,
  VibeData<"UpsertEnvVar">
> = AGREES;

const _deleteEnvVar: Mirrors<
  "DeleteEnvVarResponse",
  DeleteEnvVarResponse,
  VibeData<"DeleteEnvVar">
> = AGREES;

/**
 * The listed sets, against the contract's. The DTO fields hold
 * `Listed | VibeUnlistedValue`, which every wire value satisfies, so the shapes
 * above cannot see a value newly LISTED upstream — these can, in both directions.
 * `scopeRank` and the card-status column are keyed on exactly these.
 */
const _envScopes: SameMembers<"VibeEnvVarScope", VibeEnvVarScope, VibeEnvVarScopeValue> = true;
const _cardProjections: SameMembers<
  "VibeCardProjection",
  VibeCardProjection,
  VibeCardProjectionValue
> = true;
const _cardBindingStatuses: SameMembers<
  "VibeCardBindingStatus",
  VibeCardBindingStatus,
  VibeCardBindingStatusValue
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist.
 */
export const VIBE_ENV_WIRE_TYPES_CONFORM = [
  _envVar,
  _listEnvVars,
  _cardBinding,
  _upsertEnvVar,
  _deleteEnvVar,
  _envScopes,
  _cardProjections,
  _cardBindingStatuses
] as const;
