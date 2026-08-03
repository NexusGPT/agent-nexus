/**
 * The pure core of the `vibe-audit-event-types.generated.ts` codegen: parse a
 * Prisma enum out of schema TEXT, render the module that mirrors it.
 *
 * Neither function touches the filesystem, and two callers share both:
 *
 *   - `scripts/generate-vibe-audit-event-types.ts` reads the schema, calls
 *     these, and writes the result.
 *   - `vibe-audit-event-types.test.ts` re-derives the module and fails when
 *     the committed file no longer matches the schema.
 *
 * Sharing them is the point. A second implementation in the test would agree
 * with the generator only by luck, and drift is exactly the case where the two
 * must not diverge.
 *
 * This module lives under `src/` because `tsconfig.json` sets `rootDir: src` —
 * a test cannot import from `scripts/` without breaking typecheck. It does not
 * reach the published binary: `src/index.ts` cannot reach it, so tsup leaves
 * it out of the bundle. The generated array is what ships.
 */

/** The enum this CLI mirrors. Named once, used by the script and the test. */
export const ENUM_NAME = "VibeAuditEventType";

/** A `///` doc line, a `//` comment, an attribute, or a blank line. */
const NON_MEMBER_LINE = /^(\/\/|@@|$)/;

/** A bare Prisma enum member: `SCREAMING_SNAKE`, first token on its line. */
const MEMBER = /^[A-Z][A-Z0-9_]*$/;

/**
 * The members of `enum <name>` in declaration order, or `[]` when the schema
 * declares no such enum.
 *
 * Declaration order is preserved rather than sorted: the schema groups these
 * by lifecycle (trigger, build, deploy, capacity), and a reader scanning
 * `--help` gets that grouping for free. Callers needing a set comparison sort
 * their own copy.
 */
export function parsePrismaEnumMembers(schema: string, name: string): string[] {
  const lines = schema.split("\n");
  const declaration = new RegExp(`^enum\\s+${name}\\s*\\{`);
  const start = lines.findIndex((line) => declaration.test(line.trim()));
  if (start === -1) return [];

  const members: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "}") return members;
    if (NON_MEMBER_LINE.test(line)) continue;
    // A member line may carry a trailing attribute (`@map("x")`); the
    // identifier is always the first token.
    const token = line.split(/\s+/)[0];
    if (MEMBER.test(token)) members.push(token);
  }
  // Unterminated block — a malformed schema. Return what was found rather than
  // an empty list, so the caller's comparison fails loudly instead of quietly
  // asserting that two empty arrays are equal.
  return members;
}

/** The exact text of `src/vibe-audit-event-types.generated.ts` for `members`. */
export function renderGeneratedModule(members: readonly string[]): string {
  const entries = members.map((member) => `  "${member}"`).join(",\n");
  return `// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/prisma-db/schema.prisma, enum ${ENUM_NAME}.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:audit-types
//
// \`vibe-audit-event-types.test.ts\` fails when this file drifts from the
// schema, so a new event type cannot ship with the CLI still refusing it.

/**
 * Every event type the Vibe audit feed can emit — the allowed values of
 * \`nexus vibe audit list --type\`.
 *
 * In schema declaration order, which groups by lifecycle (trigger, build,
 * deploy, capacity) rather than alphabetically.
 */
export const VIBE_AUDIT_EVENT_TYPES = [
${entries}
] as const;

export type VibeAuditEventType = (typeof VIBE_AUDIT_EVENT_TYPES)[number];
`;
}
