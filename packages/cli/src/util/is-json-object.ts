/**
 * Whether a value is a JSON OBJECT — an object that is neither `null` nor an array.
 *
 * The CLI's one copy of `@nexus/types`' `isJsonObject`, kept here rather than imported
 * because the published binary may not reach `@nexus/types` at all: that package pulls
 * Zod and the generated Prisma enums into the bundle, and
 * `src/wire-types-bundle.test.ts` refuses any import of it outside a conformance module.
 * Same test, same name, so a reader moving code between the two sees one guard.
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
