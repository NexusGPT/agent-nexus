/**
 * THE DRIFT GATE for the two shapes `vibe-wire-types.ts` itself declares.
 *
 * The CLI is published as a standalone npm package, so `@nexus/types` cannot be
 * a runtime dependency and the Vibe wire shapes are hand-declared. That is safe
 * only while something FAILS when a declaration stops matching the contract it
 * copies. Until these gates existed, the only thing asking for lockstep was a
 * comment saying "keep these in lockstep" — and SEVEN shapes had already drifted
 * past it:
 *
 *   · `VibeAppDto` had no `shipGateMode`, `linkedToolId` or `icon`.
 *   · `VibeAppListItemDto` had neither deployment summary, so the CLI's app
 *     list could not say whether an app was serving.
 *   · `VibeAppEnvVarDto` had no `secretMaterial`, the write gate's verdict on a
 *     stored value.
 *   · `AuditPayloadDeploymentTriggered` had no `triggerSource`, the field added
 *     to answer "why did this app deploy twice for one commit".
 *   · `AuditPayloadCostSafetyAutoSuspended`'s `usageType` was missing
 *     `VIBE_BACKUP_MIN`, so a backup-minutes suspension arrived as a value the
 *     union called impossible.
 *   · `SingleVibeGitProjectResponse.repository` was typed as a full project
 *     while the wire declares three of its fields optional.
 *   · `VibeGitProjectDto` was documented as a "subset" and was a full mirror,
 *     which invites a reader to take a future missing field for a choice.
 *
 * Six of the seven broke no command — an unmodelled key is simply not printed,
 * so there was nothing to notice. The seventh printed
 * `git rebase origin/undefined`. That is the failure mode these files close: they
 * make the omission a COMPILE ERROR that has to be mirrored or written down.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *
 * Every assertion is a `const` whose declared type is `true` when the shapes
 * agree and a descriptive TUPLE when they do not, so `pnpm typecheck` prints
 * the offending field names rather than `'false' is not assignable to 'true'`.
 * There is no runtime behaviour here at all; the module exists to be compiled.
 *
 * The comparison target is `TApi[…]["Response"]` — the ENDPOINT contract, not
 * the entity schema behind it. A response is what the CLI actually receives, so
 * a field that exists on an entity but never leaves the server cannot produce a
 * false failure here.
 *
 * ── 🔴 Why `VibeData` is RE-DECLARED in every Vibe gate ─────────────────────
 *
 * `vibe-wire-vocabulary.conformance.ts` exports an identical `VibeData`, and
 * taking it from there would be the obvious move. It is the wrong one, and the
 * reason is a gate rather than a preference: `wire-types-bundle.test.ts`
 * requires every `.conformance.ts` to import `@nexus/types`, so a gate whose
 * only reach to the contract went through the shared vocabulary would carry
 * that import UNUSED — one `unused-imports/no-unused-imports` warning per
 * module, against a package running `eslint . --max-warnings 9`. Binding `TApi`
 * here is what makes the import REAL, and it is the same trade
 * `admin-vibe-cost-safety-wire-types.conformance.ts` records for the fully
 * decomposed admin pair. What stays shared is everything that needs no contract
 * of its own: the operators in `wire-conformance.types.ts`, and `Listed`,
 * `ListedArms`, `SameMembers`, `UnlistedArmAdmitted` and `VibeEnvelopedOp` in
 * the vocabulary. `VibeEnvelopedOp` is a KEY SET rather than a lookup, so
 * importing it drags no `@nexus/types` reach with it — and it is load-bearing:
 * `DownloadAppStarter` declares no `Response`, and an unguarded lookup would
 * silently yield `never`, which satisfies every assertion in `Mirrors`.
 *
 * ── Why this file cannot reach the published binary ─────────────────────────
 *
 * `src/index.ts` cannot reach this module, so tsup's bundle graph never visits
 * it and the `@nexus/types` imports below (which pull Zod, and transitively the
 * generated Prisma enums) stay out of `dist/`. `wire-types-bundle.test.ts` holds
 * that property as an assertion rather than as this paragraph: it fails if any
 * module the binary CAN reach imports `@nexus/types`.
 */

import type { TApi } from "@nexus/types";
import type { TApiPublicV1 } from "@nexus/types/public-api-v1";

import type { DeletedIdResponse, ExternalToolDetail } from "./vibe-wire-types";
import type { VibeEnvelopedOp } from "./vibe-wire-vocabulary.conformance";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of a tenant Vibe endpoint, unwrapped from its envelope. */
type VibeData<Op extends VibeEnvelopedOp> = Wire<
  TApi["Vibe"][Op] extends { Response: { data: infer D } } ? D : never
>;

const _deleteApp: Mirrors<"DeletedIdResponse", DeletedIdResponse, VibeData<"DeleteApp">> = AGREES;

/**
 * `app register-as-tool` is the one Vibe command that leaves the tenant surface
 * for `/api/public/v1`, so its response is a different contract with a
 * different envelope — bare, not `ApiSuccess`-wrapped.
 */
const _registeredTool: Mirrors<
  "ExternalToolDetail",
  ExternalToolDetail,
  Wire<TApiPublicV1["VibeRegisterAppAsTool"]["Response"]>
> = AGREES;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertions' reason to exist, and
 * keeps a reader from concluding the file is dead and removing it.
 */
export const VIBE_WIRE_TYPES_CONFORM = [_deleteApp, _registeredTool] as const;
