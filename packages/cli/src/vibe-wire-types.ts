/**
 * THE WIRE SHAPES `nexus vibe …` reads off the Vibe HTTP surface.
 *
 * These mirror the Zod schemas under
 * `packages/types/src/api/domains/vibe/schemas/`. The CLI is published as a
 * standalone npm package and `@nexus/types` is not a runtime dependency, so the
 * shapes are re-declared here rather than imported.
 *
 * A COMMENT ASKING FOR LOCKSTEP IS NOT A MECHANISM, and this file used to have
 * only that. The `.conformance.ts` gate beside each module is the mechanism: it
 * imports the real schemas and fails `pnpm typecheck` when a declaration stops
 * matching one — a field added to a schema, a field removed, a type narrowed. A
 * shape the CLI deliberately renders only part of declares the omitted field
 * names there, so a NEW omission has to be written down before it compiles.
 *
 * ── This module is the INDEX ────────────────────────────────────────────────
 *
 * One module per surface, each with its gate beside it, and this file re-exports
 * every name so no import site had to move. It DECLARES only the two shapes that
 * belong to no single surface: the register-as-tool bridge's detail, which
 * crosses to `/api/public/v1` and is a different contract with a different
 * envelope, and the receipt both delete routes answer with.
 * `vibe-wire-types.conformance.ts` gates exactly those two.
 *
 * 🔴 THE RE-EXPORTS BELOW IMPORT NOTHING, AND THAT IS A CONSTRAINT RATHER THAN
 * AN ACCIDENT. A leaf declares its own shapes and takes what it needs from
 * another LEAF, never from this file — an index its own siblings import back
 * from is a cycle, and `import/no-cycle` is armed on this package from
 * `packages/config/eslint/base-flat.js` at one warning per sibling.
 *
 * It never reaches the published binary as a dependency edge: every conformance
 * module is unreachable from `src/index.ts`, so tsup leaves each one — and the
 * `@nexus/types` import it carries — out of the bundle.
 */

/**
 * The registered-tool detail returned by the register-as-tool bridge.
 * Mirrors `ExternalToolDetailSchema` in
 * packages/types/src/api/public/v1/schemas/skills.schemas.ts.
 */
export interface ExternalToolDetail {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  documentation: string | null;
  type: "CUSTOM_MANIFEST";
  endpointUrl: string | null;
  status: string;
  actionsCount: number;
  authType: string;
  createdAt: string;
}

/** Both delete routes answer with the id they removed. */
export interface DeletedIdResponse {
  deletedId: string;
}

// One module per surface. Re-exported so import sites are unchanged.
export * from "./vibe-app-envelope-wire-types";
export * from "./vibe-app-wire-types";
export * from "./vibe-deploy-state-wire-types";
export * from "./vibe-deployment-request-wire-types";
export * from "./vibe-deployment-trigger-wire-types";
export * from "./vibe-edge-token-wire-types";
export * from "./vibe-env-wire-types";
export * from "./vibe-git-project-wire-types";
export * from "./vibe-log-wire-types";
