import { ReadySetQuerySchema } from "@nexus/types/public-api-v1";

/**
 * WHAT THE READY-SET CONTRACT WILL ACTUALLY ACCEPT AS A `limit`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CONFORMANCE MODULE AND NOT AN IMPORT AT THE CALL SITE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `READY_SET_CEILING` in `util/track-blockers.render.ts` is a hand-copied `200`.
 * The obvious repair — import the server's `READY_SET_MAX_LIMIT` — is not
 * available, and the reasons are three separate walls rather than one:
 *
 *   1. That constant lives in `apps/backend/src/tracks/domain/value-objects/
 *      ready-set-limit.ts`. It is not published anywhere, and this package
 *      cannot depend on an app. The FRONTEND hit the identical wall and wrote it
 *      down at `track-dependency-graph-state.ts` — "which the frontend cannot
 *      import".
 *   2. `@nexus/types` exports no named constant for it either; the ceiling
 *      exists there only as `.max(200)` inside {@link ReadySetQuerySchema}.
 *   3. `wire-types-bundle.test.ts` forbids `@nexus/types` in EVERY file that is
 *      not a `*.conformance.ts` — reachable from the binary or not — because the
 *      package pulls Zod and the generated Prisma enums, which is the +5MB the
 *      CLI's standalone publishing model exists to avoid.
 *
 * So the constant stays hand-written where the binary can reach it, and the pin
 * lives HERE, where the real contract is legal to import and the binary is not.
 *
 * ── WHAT THIS PINS, AND WHAT IT HONESTLY CANNOT ─────────────────────────────
 *
 * ✅ It pins the CLI's ceiling to the PUBLISHED DOOR. Asking above
 *    `ReadySetQuerySchema`'s max is a 400, so a CLI that asked for more would
 *    break loudly on every call; a CLI that asked for less would quietly
 *    cross-check `why-not-ready` against a partial ready set.
 *
 * 🚨 IT CANNOT SEE `clampReadySetLimit`. The server CLAMPS internally rather
 *    than refusing, and that clamp is not observable to any client. If the clamp
 *    alone dropped below the schema max, the server would return fewer rows than
 *    asked for, `serverReadyTruncated` would read false over a truncated set, and
 *    `why-not-ready` would print "the server and this reconstruction name
 *    DIFFERENT ready sets" on a HEALTHY board. This pin does not catch that, and
 *    saying so is the point — a gate that implies coverage it lacks is how the
 *    next reader stops looking. Closing it needs the two numbers tied together
 *    on the SERVER side, which is not this package's to do.
 *
 * Behavioural rather than a read of Zod's internals: `_def.checks` is a private
 * shape that moves between majors, and a pin that breaks on a dependency bump
 * gets deleted rather than investigated.
 */
export const readySetLimitAccepted = (limit: number): boolean =>
  ReadySetQuerySchema.safeParse({ limit }).success;
