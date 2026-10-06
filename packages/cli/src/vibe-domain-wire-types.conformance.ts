/**
 * THE DRIFT GATE for `vibe-domain-wire-types.ts` — same mechanism and vocabulary
 * as `vibe-wire-types.conformance.ts`: each assertion's declared type is `true`
 * only while the CLI's hand-declared shape matches the endpoint contract, so
 * `pnpm typecheck` fails, naming the field, the day one drifts. Compiled, never
 * executed, unreachable from `src/index.ts`.
 */

/** A TYPE namespace, so the Prisma enum arrays are read without importing a value. */
import type * as NexusTypes from "@nexus/types";

import type {
  AddVibeAppDomainResponse,
  DeleteVibeAppDomainResponse,
  ListVibeAppDomainsResponse,
  SetVibeAppPrimaryDomainResponse,
  VerifyVibeAppDomainResponse,
  VIBE_APP_DOMAIN_KINDS,
  VIBE_APP_DOMAIN_STATUSES,
  VibeAppDomainDnsInstructionsDto,
  VibeAppDomainDnsRecordDto,
  VibeAppDomainDto,
  VibeAppDomainKind,
  VibeAppDomainStatus
} from "./vibe-domain-wire-types";
import type { VibeUnlistedVariant } from "./vibe-unlisted-variant";
import {
  type Listed,
  type ListedArms,
  type SameMembers,
  type UnlistedArmAdmitted,
  type VibeData
} from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors } from "./wire-conformance.types";

type WireDomain = VibeData<"ListAppDomains">["domains"][number];

/**
 * Every field is mirrored: `list` and `add` render status, reason, primary and
 * the records, and `--json` passes the whole object through.
 */
const _appDomain: Mirrors<"VibeAppDomainDto", VibeAppDomainDto, WireDomain> = AGREES;

/**
 * The record row `add` prints as the table to copy. Checked on its own because
 * `SharedFieldsMatch` on `VibeAppDomainDto` compares `dns` as one union and would
 * report a renamed record field as nothing more specific than a mismatch.
 */
const _appDomainRecord: Mirrors<
  "VibeAppDomainDnsRecordDto",
  VibeAppDomainDnsRecordDto,
  Extract<WireDomain["dns"], { status: "ready" }>["records"][number]
> = AGREES;

/**
 * The LISTED instruction arms, both directions, and the unlisted arm the printer
 * asks about first — which must exist and be admitted, or a newer status is lost.
 */
const _appDomainDnsArms: SameMembers<
  "VibeAppDomainDnsInstructionsDto['status']",
  VibeAppDomainDnsInstructionsDto["status"],
  ListedArms<WireDomain["dns"], "status">["status"]
> = true;

const _appDomainDnsUnlisted: UnlistedArmAdmitted<
  "VibeAppDomainDnsInstructionsRead",
  VibeUnlistedVariant<"status">,
  WireDomain["dns"],
  "status"
> = true;

const _appDomainStatuses: SameMembers<
  "VibeAppDomainStatus",
  VibeAppDomainStatus,
  Listed<WireDomain["status"]>
> = true;

const _appDomainKinds: SameMembers<
  "VibeAppDomainKind",
  VibeAppDomainKind,
  Listed<WireDomain["kind"]>
> = true;

const _listAppDomains: Mirrors<
  "ListVibeAppDomainsResponse",
  ListVibeAppDomainsResponse,
  VibeData<"ListAppDomains">
> = AGREES;

const _addAppDomain: Mirrors<
  "AddVibeAppDomainResponse",
  AddVibeAppDomainResponse,
  VibeData<"AddAppDomain">
> = AGREES;

const _verifyAppDomain: Mirrors<
  "VerifyVibeAppDomainResponse",
  VerifyVibeAppDomainResponse,
  VibeData<"VerifyAppDomain">
> = AGREES;

const _deleteAppDomain: Mirrors<
  "DeleteVibeAppDomainResponse",
  DeleteVibeAppDomainResponse,
  VibeData<"DeleteAppDomain">
> = AGREES;

const _setPrimaryDomain: Mirrors<
  "SetVibeAppPrimaryDomainResponse",
  SetVibeAppPrimaryDomainResponse,
  VibeData<"SetAppPrimaryDomain">
> = AGREES;

/**
 * The CLI's own ARRAYS against the Prisma enum, not only its types against the
 * response contract. `colorizeDomainStatus` and the help text enumerate these
 * values, and the arrays are what a future `--status` filter would validate
 * against; a value the column gains must reach them, and one it drops must leave.
 */
const _appDomainStatusValues: SameMembers<
  "VIBE_APP_DOMAIN_STATUSES",
  (typeof VIBE_APP_DOMAIN_STATUSES)[number],
  (typeof NexusTypes.DbEnum.VIBE_APP_DOMAIN_STATUS_VALUES)[number]
> = true;

const _appDomainKindValues: SameMembers<
  "VIBE_APP_DOMAIN_KINDS",
  (typeof VIBE_APP_DOMAIN_KINDS)[number],
  (typeof NexusTypes.DbEnum.VIBE_APP_DOMAIN_KIND_VALUES)[number]
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist.
 */
export const VIBE_DOMAIN_WIRE_TYPES_CONFORM = [
  _appDomain,
  _appDomainRecord,
  _appDomainDnsArms,
  _appDomainDnsUnlisted,
  _appDomainStatuses,
  _appDomainKinds,
  _appDomainStatusValues,
  _appDomainKindValues,
  _listAppDomains,
  _addAppDomain,
  _verifyAppDomain,
  _deleteAppDomain,
  _setPrimaryDomain
] as const;
