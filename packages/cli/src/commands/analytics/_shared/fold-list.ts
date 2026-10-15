import { ANALYTICS_QUERY_STRUCTURED__BODY_VIEW } from "../../analytics.contract.generated";

/**
 * A comma list folded to the width of the prose around it.
 *
 * `addHelpText` output is emitted VERBATIM — commander re-wraps the generated
 * usage and options and never the blocks this namespace writes — so an
 * interpolated value is the one thing in a hand-wrapped paragraph whose length
 * nobody controls. The eight physical view names on one line rendered a
 * 220-column row inside a block wrapped at 78, and a ninth view would have
 * pushed it further with nothing going red. Folding keeps the width a property
 * of the data rather than of a line break somebody typed once.
 */
export function foldList(items: readonly string[], width: number, indent: string): string {
  const lines: string[] = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last}, ${item}`.length + indent.length <= width) {
      lines[lines.length - 1] = `${last}, ${item}`;
    } else {
      lines.push(item);
    }
  }
  return lines.join(`,\n${indent}`);
}

/**
 * The curated views, from the contract rather than retyped.
 *
 * This list used to be eight string literals with a comment asking whoever
 * edited `ANALYTICS_VIEW_NAMES` to remember this file — "the CLI ships
 * standalone, so it can't import it". It can't import it at RUNTIME; it can
 * generate from it at build time, which is what
 * `analytics.contract.generated.ts` is. `contract-help.test.ts` fails if the
 * generated copy stops matching the schema.
 *
 * `query` (raw SQL) addresses the PHYSICAL view, `metrics` (structured) the
 * public one, and both derive from this single array so they cannot disagree
 * about which views exist.
 */
export const ANALYTICS_PUBLIC_VIEWS = foldList(
  ANALYTICS_QUERY_STRUCTURED__BODY_VIEW.contractValues,
  76,
  "  "
);

/** The same eight views under the name `analytics query` takes. */
export const ANALYTICS_PHYSICAL_VIEWS = foldList(
  ANALYTICS_QUERY_STRUCTURED__BODY_VIEW.contractValues.map((view) => `analytics_${view}`),
  76,
  "    "
);
