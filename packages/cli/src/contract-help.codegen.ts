import { renderEnumConst, renderShapeConst } from "./contract-help.codegen.consts";
import {
  constNameFor,
  refuseOnNameCollision,
  shapeConstNameFor
} from "./contract-help.codegen.names";
import type { ProjectedDescriptor } from "./contract-help.render";

export { constNameFor, shapeConstNameFor } from "./contract-help.codegen.names";

/**
 * The PURE core of the contract-help codegen: plain data in, module text out.
 *
 * No Zod, no `@nexus/types`, no filesystem. Two callers share it, which is the
 * whole reason it is its own file:
 *
 *   · `scripts/generate-contract-help.ts` renders and writes.
 *   · `contract-help.codegen.test.ts` renders fixtures and asserts the shape.
 *
 * Sharing them is the point. A second implementation in the test would agree
 * with the generator only by luck, and drift is exactly the case where the two
 * must not diverge.
 *
 * It lives under `src/` because `tsconfig.json` sets `rootDir: src` and a test
 * cannot import from `scripts/` without breaking typecheck — the same reason
 * `vibe-audit-event-types.codegen.ts` sits here, and the same shape. Nothing the
 * published binary can reach imports it, so tsup leaves it out; only the emitted
 * data modules ship.
 *
 * The naming and its refusal are `contract-help.codegen.names.ts`; the two
 * per-const renderers are `contract-help.codegen.consts.ts`. Neither imports
 * this file back, so the re-export stays acyclic.
 */

/**
 * The exact text of `src/commands/<namespace>.contract.generated.ts`.
 *
 * DATA ONLY — no rendered prose. An earlier version baked the `--help` block in
 * as a string and printed a deployment type the CLI deliberately does not offer,
 * directly above the hand-written lines explaining why it does not. The
 * generator cannot see a divergence declared at the flag, so it does not compose
 * sentences; `contract-help.render.ts` does that at runtime, where both halves
 * are in scope.
 *
 * Determinism: descriptors are rendered in the order given (the caller sorts),
 * fields in contract declaration order, and nothing here reads the filesystem or
 * iterates an object whose key order it did not establish. Two runs over the
 * same contract produce identical bytes.
 */
export function renderGeneratedModule(
  namespace: string,
  descriptors: readonly ProjectedDescriptor[]
): string {
  const enumFields = descriptors.flatMap((descriptor) =>
    descriptor.fields.filter((field) => field.enumValues).map((field) => ({ descriptor, field }))
  );

  // Every name this module is about to export, enum consts and shape consts
  // alike — they share one module scope, so they can only be judged together.
  refuseOnNameCollision(namespace, [
    ...enumFields.map(({ descriptor, field }) => ({
      name: constNameFor(descriptor.name, field.path),
      path: `${descriptor.name}.${field.path}`
    })),
    ...descriptors.map((descriptor) => ({
      name: shapeConstNameFor(descriptor.name),
      path: `${descriptor.name} (shape)`
    }))
  ]);

  const enums = enumFields.map(({ descriptor, field }) => renderEnumConst(descriptor, field));
  const shapes = descriptors.map(renderShapeConst);

  /*
   * `ContractEnum` IS IMPORTED ONLY WHEN AN ENUM CONST USES IT, and the reason is
   * a lint budget rather than tidiness.
   *
   * A namespace whose descriptors declare no enum at all is the COMMON case, not
   * the corner one — most of the rollout's remaining work is exactly that shape,
   * and each such module used to emit one `unused-imports/no-unused-imports`
   * warning. `packages/cli` lints with `--max-warnings 9`, so the count crossed
   * the budget partway through the rollout and every further zero-enum namespace
   * pushed it further: a red that grows by one per unit of correct work, and
   * whose cause is in a generated file nobody edits.
   *
   * `ProjectedDescriptor` needs no such guard — every module emits at least one
   * shape const, because the generator refuses to write a module for a namespace
   * that projects nothing at all.
   */
  const enumImport =
    enums.length > 0 ? `import type { ContractEnum } from "../contract-binding";\n` : "";

  return `// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/types/src/api/public/v1/contract/, via z.toJSONSchema.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:contract-help
//
// NOTHING UNDER \`src/\` RE-DERIVES THIS. That needs Zod, which the published
// binary does not depend on, so \`commands/contract-help.test.ts\` checks the
// flags against this data and says so in its own header — it cannot tell you
// the data is current. \`scripts/generated-drift.mjs\` is what does: it
// regenerates and requires a byte-exact match, at review time in the
// \`Generated config\` job of pr-checks.yml and again on every push to
// staging/main.
//
// 🚨 THIS FILE IS ONE OF TWO OPINIONS, NEVER THE AUTHORITY. Where the CLI offers
// fewer values than the contract lists, the reason is declared at the flag in
// \`${namespace}.ts\` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

${enumImport}import type { ProjectedDescriptor } from "../contract-help.render";

${[...enums, ...shapes].join("\n\n")}
`;
}
