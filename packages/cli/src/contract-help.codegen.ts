import type { ProjectedDescriptor, ProjectedField } from "./contract-help.render";

/**
 * The PURE core of the contract-help codegen: plain data in, module text out.
 *
 * No Zod, no `@nexus/types`, no filesystem. Two callers share it, which is the
 * whole reason it is its own file:
 *
 *   · `scripts/generate-contract-help.ts` renders and writes.
 *   · `commands/contract-help.test.ts` re-renders and fails on a byte of drift.
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
 */

/**
 * `AnalyticsQueryStructured` + `Body.filters[].op` →
 * `ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP`.
 *
 * A double underscore separates the descriptor from the path so the two halves
 * stay legible, and `[]` becomes `_ITEM` rather than vanishing — `filters.op`
 * and `filters[].op` are different claims about the schema, and a naming scheme
 * that collapsed them would emit one const for two fields.
 */
export function constNameFor(descriptor: string, path: string): string {
  const screaming = (text: string): string =>
    text
      .replace(/\[\]/g, "_ITEM")
      .replace(/[.\s]+/g, "_")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/_+/g, "_")
      .toUpperCase();
  return `${screaming(descriptor)}__${screaming(path)}`;
}

/** `AnalyticsQueryStructured` → `ANALYTICS_QUERY_STRUCTURED_CONTRACT`. */
export function shapeConstNameFor(descriptor: string): string {
  return `${constNameFor(descriptor, "x").replace(/__X$/, "")}_CONTRACT`;
}

function literal(text: string): string {
  return JSON.stringify(text);
}

function renderEnumConst(descriptor: ProjectedDescriptor, field: ProjectedField): string {
  const name = constNameFor(descriptor.name, field.path);
  const values = (field.enumValues ?? []).map((value) => `    ${literal(value)}`).join(",\n");
  return `export const ${name} = {
  path: ${literal(`${descriptor.name}.${field.path}`)},
  contractValues: [
${values}
  ]
} as const satisfies ContractEnum;`;
}

function renderShapeConst(descriptor: ProjectedDescriptor): string {
  const fields = descriptor.fields
    .map((field) => {
      const parts = [
        `path: ${literal(field.path)}`,
        `slot: ${literal(field.slot)}`,
        `type: ${literal(field.type)}`,
        `required: ${field.required}`,
        `depth: ${field.depth}`
      ];
      if (field.enumValues) {
        parts.push(`enumValues: [${field.enumValues.map(literal).join(", ")}]`);
      }
      if (field.opaque) parts.push("opaque: true");
      return `    { ${parts.join(", ")} }`;
    })
    .join(",\n");

  return `export const ${shapeConstNameFor(descriptor.name)} = {
  name: ${literal(descriptor.name)},
  method: ${literal(descriptor.method)},
  route: ${literal(descriptor.route)},
  fields: [
${fields}
  ]
} as const satisfies ProjectedDescriptor;`;
}

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
  const enums = descriptors.flatMap((descriptor) =>
    descriptor.fields
      .filter((field) => field.enumValues)
      .map((field) => renderEnumConst(descriptor, field))
  );
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
// \`commands/contract-help.test.ts\` re-derives this from the live contract and
// fails when the committed copy drifts, so a contract change cannot ship with
// the CLI still offering the old values.
//
// 🚨 THIS FILE IS ONE OF TWO OPINIONS, NEVER THE AUTHORITY. Where the CLI offers
// fewer values than the contract lists, the reason is declared at the flag in
// \`${namespace}.ts\` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

${enumImport}import type { ProjectedDescriptor } from "../contract-help.render";

${[...enums, ...shapes].join("\n\n")}
`;
}
