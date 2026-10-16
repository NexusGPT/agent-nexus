/**
 * THE DRIFT GATE for the domain claim TTL, compared as a LITERAL type.
 *
 * `nexus apps domains add` prints this figure in a sentence, so it is the one
 * number in the domain surface a reader acts on away from the terminal — they
 * schedule a DNS change against it. The CLI cannot import the contract's
 * constant (the binary may not reach `@nexus/types`), so it holds a hand-written
 * copy in `vibe-domain-wire-types.ts`, and this is what keeps that copy honest:
 * `pnpm typecheck` fails the day the contract's figure moves.
 *
 * Both constants are bare numeric literals, which is what makes the comparison
 * possible — a computed expression infers as `number` and cannot be gated this
 * way. `SameLiteral` checks BOTH directions for that reason: a one-way `extends`
 * would start passing vacuously the moment the upstream type widened, which is
 * the exact moment the gate stopped being able to see anything.
 *
 * ── WHY THIS SITS IN ITS OWN FILE ───────────────────────────────────────────
 *
 * It is a different claim from the ones next door. `vibe-domain-wire-types.conformance.ts`
 * gates the SHAPES of this surface — which fields a response carries, which arms
 * a union lists — and every assertion there reads `VibeData<...>`. This one gates
 * one constant's VALUE, reads a different export, and needs the argument above
 * stated beside it to survive a reader who thinks a one-way `extends` would do.
 *
 * That separation is also what keeps both files out of
 * `source-file-size.ledger.test.ts`: the shapes gate sits at exactly the 150
 * lines that ledger allows an unrowed file, so it has no room for a second
 * concern, and making room by moving a mirror out would be moving code for the
 * wrong reason.
 *
 * Compiled, never executed, unreachable from `src/index.ts`. The
 * `.conformance.ts` suffix is not decoration: this module imports
 * `@nexus/types`, and `wire-types-bundle.test.ts` admits that import ONLY into a
 * module carrying the suffix.
 */

/** A TYPE namespace, so the contract's constant is read without importing a value. */
import type * as NexusTypes from "@nexus/types";

import type { VIBE_APP_DOMAIN_WIRE_PENDING_CLAIM_TTL_DAYS } from "./vibe-domain-wire-types";
import { type SameLiteral } from "./vibe-wire-vocabulary.conformance";

const _pendingClaimTtlDays: SameLiteral<
  "VIBE_APP_DOMAIN_WIRE_PENDING_CLAIM_TTL_DAYS",
  typeof VIBE_APP_DOMAIN_WIRE_PENDING_CLAIM_TTL_DAYS,
  typeof NexusTypes.VIBE_APP_DOMAIN_PENDING_CLAIM_TTL_DAYS
> = true;

/**
 * Nothing imports this module — it is compiled, never executed. The export
 * keeps `noUnusedLocals` from deleting the assertion's reason to exist.
 */
export const VIBE_DOMAIN_CLAIM_TTL_CONFORMS = [_pendingClaimTtlDays] as const;
