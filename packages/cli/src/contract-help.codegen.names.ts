/**
 * THE NAMES the contract-help codegen is about to export, and the refusal that
 * stands between a contract key and an illegal or ambiguous one.
 *
 * Pure: strings in, strings out, or a throw. `contract-help.codegen.ts` is the
 * public name for this family and its header owns why the whole thing lives
 * under `src/`.
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
export function refuseOnNameCollision(
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
