import { DbEnum, MCP_SYNC_ERROR_CODES } from "@nexus/types";

/**
 * THE TWO VOCABULARIES `mcp-server sync` READS ITS VERDICT OUT OF.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A CONFORMANCE MODULE AND NOT AN IMPORT IN THE SPEC
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `wire-types-bundle.test.ts` forbids `@nexus/types` in EVERY file under `src/` that is
 * not a `*.conformance.ts` — reachable from the published binary or not — because that
 * package pulls Zod and the generated Prisma enums, which is the +5MB the CLI's
 * standalone publishing model exists to avoid. So the vocabularies are read HERE and
 * the module that classifies them stays importable by the bundle.
 *
 * The same shape, and the same three walls, as `mcp-server-tool-counts.conformance.ts`.
 *
 * ## 🔴 WHY THE ARMS THESE FEED NEED A RUNTIME READING AT ALL
 *
 * `sync-verdict.ts` splits ONE answer into five states, and the split is hand-written
 * against types that travel
 *
 *   schema.prisma -> DbEnum.McpSyncOutcome ----\
 *   MCP_SYNC_ERROR_CODES --------------------- > McpServerSummary (types)
 *                                              -> McpServerSummary (SDK, hand-written)
 *                                              -> the five branches in sync-verdict.ts
 *
 * where every link but the last is somebody else's file. A member added to either
 * vocabulary arrives at the classifier as a string, and the classifier's DEFAULTS then
 * decide its meaning with nobody having chosen: a new outcome lands in `unlisted`, and
 * a new ERROR code lands in `ran-and-failed`. Both defaults are the right direction and
 * neither is a decision. Comparing the hand-written tables against these readings makes
 * each new member a red instead.
 *
 * ⚠️ `null` IS IN NEITHER LIST AND MUST NOT BE ADDED TO EITHER. It is the column being
 * NULL — a server nobody has dialled, or a non-FAILED outcome carrying no code — not a
 * member of a value set. `classifyMcpSyncAnswer` handles both nulls explicitly.
 *
 * ## 🔴 BOTH READS COME FROM THE BARE `@nexus/types`, AND THE SUBPATH IS NOT A STYLE
 * ## CHOICE — IT BLINDS A GATE
 *
 * `MCP_SYNC_ERROR_CODES` lives in `shared/domain/mcp/mcp-sync-error-code.ts` and is
 * reachable two ways: `@nexus/types/domain`, and the bare `@nexus/types`, which
 * re-exports it through three `export * from` hops. They are the same value.
 *
 * `packages/types/src/testing/ledger-gates-do-not-refuse-their-cure.test.ts` scans
 * these trees for ledger assertions and resolves cross-package names through ONE
 * declared alias — `{ "@nexus/types": "packages/types/src" }`. A SUBPATH specifier
 * matches no entry in that map, so the module cannot be opened and every declaration
 * aliasing a name from it is counted as one the scan COULD NOT LOOK AT. Measured on
 * this very file, which is a controlled experiment because the two reads differ in
 * nothing else: `PUBLISHED_MCP_SYNC_OUTCOMES` (bare) was absent from that population
 * and `PUBLISHED_MCP_SYNC_ERROR_CODES` (subpath) was in it, taking the bound from 67
 * to 68 and reddening `Tests: Vitest` on the promotion.
 *
 * So the specifier is load-bearing here in a way it is nowhere else in this package:
 * the bare one is what the analyser can follow, and `export * from` is a chain
 * `classifyImported` already learned to walk. A later reader "tidying" this to the
 * narrower subpath re-blinds the gate by one declaration.
 */

/** `McpServer.lastSyncOutcome`'s Prisma enum. */
export const PUBLISHED_MCP_SYNC_OUTCOMES: readonly string[] = DbEnum.MCP_SYNC_OUTCOME_VALUES;

/**
 * `McpServer.lastSyncErrorCode`'s vocabulary.
 *
 * 🔴 NOT a Prisma enum — the column is a string so a new failure class needs no
 * migration, which is exactly why the CLI cannot rely on having heard of every member
 * and why `sync-verdict.ts` tests for the ONE code that means the discovery never
 * started rather than enumerating the ones that mean it ran.
 *
 * ## 🚨 THE SPREAD IS LOAD-BEARING. `= MCP_SYNC_ERROR_CODES` BLINDS A GATE
 *
 * `packages/types/src/testing/ledger-gates-do-not-refuse-their-cure.test.ts` scans these
 * trees for ledger assertions and bounds what it COULD NOT LOOK AT. Its scan's own
 * header names this class: resolution is syntactic and reaches a module-scope `const` or
 * an `export const` in a module it can address, and *"a table built at run time, imported
 * from a package, read out of JSON, or assembled by a function is UNRESOLVED — and
 * unresolved is neither clean nor dirty."*
 *
 * A bare `= MCP_SYNC_ERROR_CODES` is an alias to a name imported from another package, so
 * the resolver follows the alias and cannot complete the second hop. The declaration then
 * joins that bounded population, and the bound went 67 -> 68 and reddened `Tests: Vitest`
 * on a promotion. A SPREAD is an array literal assembled in THIS module, which is a shape
 * the resolver reads.
 *
 * ⚠️ THE SPECIFIER IS NOT THE CAUSE, AND IT IS THE COMFORTABLE WRONG ANSWER. The scan
 * declares one alias, `{ "@nexus/types": "packages/types/src" }`, so `@nexus/types/domain`
 * looks like an unresolvable subpath — and the sibling read above, through the BARE
 * specifier, is resolved while this one was not. Measured: switching this import to the
 * bare specifier left the unresolved set BYTE-IDENTICAL at 68. The RHS shape is the whole
 * of it.
 *
 * ✅ And the fix is READ rather than merely parsed, which is the half worth proving. With
 * a debt-shaped name in a `*.ledger.ts` module and a spec driving `.each` over it: the bare
 * alias scored `unresolved` with findings at 1, and the spread scored findings at 2 — the
 * scan resolved the declaration and reported the violation. A shape that only silenced the
 * count would have left findings at 1.
 */
export const PUBLISHED_MCP_SYNC_ERROR_CODES: readonly string[] = [...MCP_SYNC_ERROR_CODES];
