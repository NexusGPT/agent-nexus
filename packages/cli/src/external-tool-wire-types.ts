/**
 * The structured `details` payloads `external-tool.ts` reads off a 409.
 *
 * WHY THEY ARE HAND-DECLARED. The CLI publishes as a standalone npm package, so
 * `@nexus/types` cannot be a runtime dependency: it pulls Zod and, transitively,
 * the generated Prisma enums — the +5MB the type-only import rule exists to keep
 * out of a bundle. So these are copies of the canonical schemas in
 * `packages/types/src/api/public/v1/schemas/skills.schemas.ts`.
 *
 * WHY A COPY RATHER THAN A `safeParse`. The canonical schemas carry a comment
 * saying "Consumers (CLI, dashboard popup) safeParse against this". The CLI
 * cannot: `safeParse` is a runtime call and would drag Zod into `dist/`, which
 * is the exact cost the hand copies exist to avoid. A declared shape plus a cast
 * at the one extraction point is the CLI's only option — so the shape has to be
 * held honest by something other than a reader's attention.
 *
 * WHY THEY LIVE HERE RATHER THAN IN `commands/external-tool.ts`. A copy is safe
 * only while something FAILS when it stops matching the original. That something
 * is `external-tool-wire-types.conformance.ts`, and it can only compare shapes
 * it can import — so the declarations have to be exported from a module of their
 * own.
 *
 * Neither shape had drifted when the gate was written. That is worth stating
 * plainly: the gate did not find a bug here, it converted "these still match"
 * from an assumption nobody had checked into a fact `pnpm typecheck` re-proves
 * on every run.
 */

/**
 * `details` on `DELETE /skills/external-tools/:id` → 409 `TOOL_HAS_ATTACHMENTS`.
 *
 * `sample` is a SAMPLE, not the whole set — `total` is the real count and the
 * two differ whenever the server truncates. The printer says "… and N more" off
 * that difference, so treating `sample.length` as the count under-reports.
 */
export interface ToolHasAttachmentsDetails {
  total: number;
  sample: Array<{
    id: string;
    label: string;
    agentId: string;
    agentName: string;
  }>;
}

/**
 * `details` on `PATCH /skills/external-tools/:id` → 409
 * `TOOL_SPEC_BREAKING_CHANGE`, raised when refreshing `openApiSpec` would drop
 * or rename an action key that downstream wiring still binds to.
 *
 * `removedActions` is the BREAKING subset — dropped operationIds that are still
 * bound — not every dropped action, so its count lines up with the bindings.
 * `bindings` samples the workflow nodes and agent tool configs that reference
 * them; `total` is the full count of such bindings.
 */
export interface ToolSpecBreakingChangeDetails {
  removedActions: string[];
  total: number;
  bindings: Array<{
    kind: "workflow" | "agent";
    id: string;
    label: string;
    action: string;
  }>;
}
