/**
 * THE DRIFT GATE for `vibe-app-wire-types.ts` — the app row itself, and the
 * four lenient vocabularies its fields are read with.
 *
 * Same mechanism as `vibe-wire-types.conformance.ts`, whose header owns it in
 * full: each `const` is typed `true` only while the shapes agree, there is no
 * runtime behaviour, and `src/index.ts` cannot reach this module so the
 * `@nexus/types` import never reaches `dist/`. `VibeData` is RE-DECLARED rather
 * than taken from the shared vocabulary for the reason that header gives — a
 * gate reaching the contract only through `vibe-wire-vocabulary.conformance.ts`
 * would carry this import unused, and the package has no warning budget for it.
 */

import type { TApi } from "@nexus/types";

import type {
  VibeAppDto,
  VibeAppEdgeReachability,
  VibeAppVisibility,
  VibeBuildComputeSize,
  VibeShipGateMode
} from "./vibe-app-wire-types";
import type { Listed, SameMembers, VibeEnvelopedOp } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

type WireApp = VibeData<"GetApp">["app"];

/**
 * `icon` is console-facing and has no CLI rendering: it is an image the terminal
 * cannot draw. `linkedToolId` is reachable as the whole tool via
 * `app register-as-tool`, which prints the tool itself rather than its id.
 *
 * `shipGateMode` IS MIRRORED, and the argument for omitting it was wrong in a
 * way worth stating once: "the gate is applied server-side, so printing the mode
 * would invite a reader to treat the CLI as the place it is decided". The CLI
 * was already printing a `Ship gate` row off `requireVerification` — the mode's
 * LOSSY boolean projection — so the omission did not keep the gate off this
 * surface. It only made the surface wrong: `WARN` projects to `false`, so a
 * guarded app printed `Ship gate: off` while every one of its deploys recorded a
 * finding. A field that a table already renders a projection of is not omitted;
 * it is misread.
 */
const _app: Mirrors<"VibeAppDto", VibeAppDto, WireApp, "icon" | "linkedToolId"> = AGREES;

/**
 * The app's lenient fields hold `Listed | VibeUnlistedValue`, which every wire
 * value satisfies — so `Mirrors` alone would wave a NEWLY LISTED value through
 * as unlisted. These pin each listed set to the contract's, both directions.
 */
const _shipGateModes: SameMembers<
  "VibeShipGateMode",
  VibeShipGateMode,
  Listed<WireApp["shipGateMode"]>
> = true;
const _buildComputeSizes: SameMembers<
  "VibeBuildComputeSize",
  VibeBuildComputeSize,
  Listed<WireApp["buildComputeSize"]>
> = true;
const _appVisibilities: SameMembers<
  "VibeAppVisibility",
  VibeAppVisibility,
  Listed<WireApp["visibility"]>
> = true;
const _edgeReachabilities: SameMembers<
  "VibeAppEdgeReachability",
  VibeAppEdgeReachability,
  Listed<NonNullable<WireApp["edgeReachability"]>>
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_APP_WIRE_TYPES_CONFORM = [
  _app,
  _shipGateModes,
  _buildComputeSizes,
  _appVisibilities,
  _edgeReachabilities
] as const;
