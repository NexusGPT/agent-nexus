import type { ProjectedDescriptor, ProjectedField } from "./contract-help.render";

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
 */

/**
 * `AnalyticsQueryStructured` + `Body.filters[].op` →
 * `ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP`.
 *
 * A double underscore separates the descriptor from the path so the two halves
 * stay legible, and `[]` becomes `_ITEM` rather than vanishing — `filters.op`
 * and `filters[].op` are different claims about the schema, and a naming scheme
 * that collapsed them would emit one const for two fields.
 *
 * 🚨 A CONTRACT KEY IS NOT AN IDENTIFIER, AND THIS ONE ASSUMED IT WAS. Every
 * path fed to it until now happened to be made of letters, digits, dots and
 * `[]`, so the four rewrites above produced a legal name by luck rather than by
 * construction. `ChannelWhatsappTemplateCreate` was the first ledger descriptor
 * to break the luck: its Twilio type keys are `twilio/call-to-action` and
 * `twilio/carousel`, which came through verbatim and emitted
 *
 *     export const CHANNEL_..._BODY_TYPES_TWILIO/CALL-TO-ACTION_..._TYPE = {
 *
 * The generator writes before it verifies, so the broken module reached disk and
 * the run then died inside esbuild — `Expected ";" but found "/"` — with no
 * mention of a contract, a field or a namespace. Anything outside `[A-Za-z0-9_]`
 * now becomes `_`, so the name is legal by construction rather than by the shape
 * of today's contract.
 *
 * That flattening can COLLIDE — `a/b` and `a-b` both become `A_B` — so
 * {@link refuseOnNameCollision} checks the emitted set rather than trusting it.
 */
export function constNameFor(descriptor: string, path: string): string {
  const screaming = (text: string): string =>
    text
      .replace(/\[\]/g, "_ITEM")
      .replace(/[.\s]+/g, "_")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      // AFTER the camel split, so a `/` or `-` cannot separate two words that
      // the split would otherwise have joined, and BEFORE the `_+` collapse, so
      // `call-to-action` does not leave a run of underscores behind.
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .toUpperCase();
  return `${screaming(descriptor)}__${screaming(path)}`;
}

/** A legal TypeScript identifier in the SCREAMING_CASE this file emits. */
const LEGAL_CONST_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * Refuse to emit a module whose const names are illegal or ambiguous.
 *
 * TWO FAILURES, ONE CHECK, and they fail at opposite ends. An illegal name is
 * loud but useless — it surfaces as an esbuild parse error in a generated file,
 * naming a column rather than a contract field. A COLLISION is silent and worse:
 * two contract fields emit the same `export const`, the second wins, and every
 * flag bound to the first is offered the other's values. Nothing downstream can
 * see it, because by then there is only one const.
 *
 * So the generator refuses here, where both halves are still in scope, and names
 * the contract paths rather than the byte offset.
 */
function refuseOnNameCollision(
  namespace: string,
  named: readonly { readonly name: string; readonly path: string }[]
): void {
  const illegal = named.filter((entry) => !LEGAL_CONST_NAME.test(entry.name));
  if (illegal.length > 0) {
    throw new Error(
      `Namespace "${namespace}" would emit ${illegal.length} illegal const name(s):\n` +
        illegal.map((e) => `  ${e.path}\n    -> ${e.name}`).join("\n")
    );
  }

  const byName = new Map<string, string[]>();
  for (const entry of named) {
    byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry.path]);
  }
  const collisions = [...byName].filter(([, paths]) => paths.length > 1);
  if (collisions.length > 0) {
    throw new Error(
      `Namespace "${namespace}" would emit one const for ${collisions.length} set(s) of ` +
        `distinct contract fields. The later declaration wins and the earlier field's flag ` +
        `would be offered the wrong values:\n` +
        collisions
          .map(([name, paths]) => `  ${name}\n${paths.map((p) => `    ${p}`).join("\n")}`)
          .join("\n")
    );
  }
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
