/**
 * THE DRIFT GATE for `vibe-log-wire-types.ts` — the mechanism and vocabulary of
 * `vibe-wire-types.conformance.ts`: each `const` is typed `true` only while the
 * CLI's hand-declared shape matches the contract, so `pnpm typecheck` fails,
 * naming the field, the day one drifts. Unreachable from `src/index.ts`.
 */

import type * as NexusTypes from "@nexus/types";

import type {
  GetVibeAppLogsResponse,
  VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH,
  VIBE_LOG_WIRE_MAX_LIMIT,
  VibeAppLogStreamEndReason,
  VibeAppLogStreamFrame,
  VibeLogColor,
  VibeLogLineDto,
  VibeLogPipelineHealthDto
} from "./vibe-log-wire-types";
import {
  type SameLiteral,
  type SameMembers,
  type VibeData
} from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

// ============================================================
// Runtime logs — the page, the follow, and the three ceilings
// ============================================================

const _logLine: Mirrors<"VibeLogLineDto", VibeLogLineDto, VibeData<"GetAppLogs">["lines"][number]> =
  AGREES;

/**
 * The pipeline verdict, field by field. `status` and `reason` are deliberately
 * wider (`string`) on the CLI side — `Mirrors` compares KEYS, so it holds the
 * field set in lockstep while leaving the published binary tolerant of a value
 * a newer platform adds.
 */
const _logPipeline: Mirrors<
  "VibeLogPipelineHealthDto",
  VibeLogPipelineHealthDto,
  NonNullable<VibeData<"GetAppLogs">["pipeline"]>
> = AGREES;

const _getAppLogs: Mirrors<
  "GetVibeAppLogsResponse",
  GetVibeAppLogsResponse,
  VibeData<"GetAppLogs">
> = AGREES;

/**
 * The SSE frame union, arm by arm.
 *
 * `Mirrors` compares object KEYS, and `keyof` a union is only the keys every arm
 * shares — which for a discriminated union is `type` alone. Comparing the unions
 * whole would therefore assert almost nothing while looking thorough. Extracting
 * each arm on its discriminant is what makes `lines`, `reason` and `message`
 * actually get checked.
 *
 * The frame contract has no `TApi` entry by design — the stream sits outside the
 * codegen — so this reads the Zod schema's own output type. `["_output"]` rather
 * than `z.infer<…>` because it needs no `zod` import, which this package does not
 * have even as a devDependency.
 */
type WireStreamFrame = Wire<(typeof NexusTypes.VibeAppLogStreamEventSchema)["_output"]>;
type ArmOf<TUnion, TType extends string> = Extract<TUnion, { type: TType }>;

const _logFrameLines: Mirrors<
  "VibeAppLogStreamFrame(lines)",
  ArmOf<VibeAppLogStreamFrame, "lines">,
  ArmOf<WireStreamFrame, "lines">
> = AGREES;

const _logFrameEnd: Mirrors<
  "VibeAppLogStreamFrame(end)",
  ArmOf<VibeAppLogStreamFrame, "end">,
  ArmOf<WireStreamFrame, "end">
> = AGREES;

const _logFrameError: Mirrors<
  "VibeAppLogStreamFrame(error)",
  ArmOf<VibeAppLogStreamFrame, "error">,
  ArmOf<WireStreamFrame, "error">
> = AGREES;

/** Every `type` the wire union spells, and no others. */
type Discriminants<TUnion> = TUnion extends { type: infer TType } ? TType : never;

const _logFrameDiscriminants: SameMembers<
  "VibeAppLogStreamFrame",
  Discriminants<VibeAppLogStreamFrame>,
  Discriminants<WireStreamFrame>
> = true;

/**
 * The end reasons, so a second reason added upstream fails here rather than
 * arriving as a value the CLI's own union calls impossible.
 */
const _logEndReasons: SameMembers<
  "VIBE_APP_LOG_STREAM_END_REASONS",
  VibeAppLogStreamEndReason,
  (typeof NexusTypes.VIBE_APP_LOG_STREAM_END_REASONS)[number]
> = true;

const _logColors: SameMembers<
  "VIBE_LOG_COLORS",
  VibeLogColor,
  (typeof NexusTypes.VibeLogColorSchema)["_output"]
> = true;

/**
 * The two numeric ceilings, compared as LITERAL types.
 *
 * This works only because both constants are declared as bare numeric literals,
 * which TypeScript widens to a literal type on a `const`. `VIBE_LOG_GATEWAY_MAX_RANGE_MS`
 * is `7 * 24 * 60 * 60 * 1000` — a computed expression, inferred as `number` — so
 * it cannot be gated this way and is mirrored by reading instead, with that said
 * out loud where the CLI declares it (`util/log-window.ts`).
 *
 * `SameLiteral` checks BOTH directions on purpose. A one-way `extends` would pass
 * vacuously the day the upstream type widens to `number`, which is the exact
 * moment the gate stops meaning anything.
 */
const _maxLimit: SameLiteral<
  "VIBE_LOG_WIRE_MAX_LIMIT",
  typeof VIBE_LOG_WIRE_MAX_LIMIT,
  typeof NexusTypes.VIBE_LOG_GATEWAY_MAX_LIMIT
> = true;

const _maxContains: SameLiteral<
  "VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH",
  typeof VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH,
  typeof NexusTypes.VIBE_LOG_GATEWAY_MAX_CONTAINS_LENGTH
> = true;

/** Compiled, never executed; the export keeps `noUnusedLocals` off the assertions. */
export const VIBE_LOG_WIRE_TYPES_CONFORM = [
  _logLine,
  _logPipeline,
  _getAppLogs,
  _logFrameLines,
  _logFrameEnd,
  _logFrameError,
  _logFrameDiscriminants,
  _logEndReasons,
  _logColors,
  _maxLimit,
  _maxContains
] as const;
