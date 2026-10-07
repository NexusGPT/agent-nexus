import { McpServerToolCountsSchema } from "@nexus/types/public-api-v1";

/**
 * THE TOOL-STATUS COUNTS `GET /public/v1/mcp-servers` ACTUALLY PUBLISHES.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CONFORMANCE MODULE AND NOT AN IMPORT IN THE SPEC
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `TOOL_COUNT_HEADERS` in `commands/mcp-server/list.command.ts` is a
 * hand-declared wire shape: one table header per published count. Its totality
 * is pinned at compile time by
 * `satisfies Readonly<Record<keyof McpServerToolCounts, string>>`, where that
 * type comes from `@agent-nexus/sdk` — a hand-written interface of its own,
 * pinned `Equals` to the v1 contract by the SDK's
 * `v1-response-types-match-the-contract.test.ts`.
 *
 * 🔴 THAT CHAIN IS TYPES ALL THE WAY DOWN, AND A TYPE CANNOT BE READ AT RUNTIME.
 * The defect this guards shipped THROUGH a clean typecheck: the old
 * hand-written column list cast each key and compiled perfectly while dropping
 * `REJECTED`. Measured — the pre-fix column set restored verbatim gives
 * `tsc --noEmit` exit 0 and the spec exit 1. So the arm that catches the real
 * case has to compare the headers against the PUBLISHED schema's own keys, at
 * runtime, and only this file may legally read them:
 * `wire-types-bundle.test.ts` forbids `@nexus/types` in EVERY file that is not a
 * `*.conformance.ts` — reachable from the binary or not — because the package
 * pulls Zod and the generated Prisma enums, which is the +5MB the CLI's
 * standalone publishing model exists to avoid.
 *
 * So the headers stay where the binary can reach them, and the pin lives HERE,
 * where the real contract is legal to import and the binary is not. Same shape,
 * and same three walls, as `ready-set-ceiling.conformance.ts`.
 *
 * 🚨 DO NOT REACH FOR A DEEPER SUBPATH TO AVOID THIS FILE. That gate's matcher
 * allows ONE path segment — `@nexus/types/public-api-v1` is caught and
 * `@nexus/types/testing/each-or-refuse` is not — so a two-segment import from an
 * ordinary module is invisible to it and bypasses the rule rather than satisfying
 * it. Measured 2026-10-07: 20 non-conformance files under `src/` already hold
 * such an import and none is reported. The +5MB the rule exists to keep out of
 * the published bundle does not care which spelling let it in.
 *
 * ── WHAT THIS PINS, AND WHAT IT HONESTLY CANNOT ─────────────────────────────
 *
 * ✅ It pins the table's column set to the PUBLISHED count names, in both
 *    directions — a count with no header, and a header keyed to a count the
 *    surface does not publish.
 *
 * 🚨 IT CANNOT SEE A STATUS THAT NEVER REACHED THE PUBLISHED SCHEMA. If a
 *    `McpToolStatus` member is added to `schema.prisma` and
 *    `McpServerToolCountsSchema` is not given a bucket for it, this agrees with
 *    the table and both are wrong together. That direction is held one layer up,
 *    by `PUBLIC_TOOL_COUNT_KEY_BY_STATUS` being a
 *    `Record<McpToolStatusValue, keyof McpServerToolCounts>` that fails to
 *    compile when the enum grows — and saying so is the point, because a gate
 *    that implies coverage it lacks is how the next reader stops looking.
 *
 * `.shape` rather than a read of Zod's private internals: it is public API on
 * every zod major this repository has run, where `_def` is a shape that moves
 * between them — and a pin that breaks on a dependency bump gets deleted rather
 * than investigated.
 */
export const PUBLISHED_TOOL_COUNT_KEYS: readonly string[] = Object.keys(
  McpServerToolCountsSchema.shape
);
