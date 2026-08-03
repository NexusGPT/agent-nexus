import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ENUM_NAME,
  parsePrismaEnumMembers,
  renderGeneratedModule
} from "./vibe-audit-event-types.codegen";
import { VIBE_AUDIT_EVENT_TYPES } from "./vibe-audit-event-types.generated";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(SRC_DIR, "..", "..", "prisma-db", "schema.prisma");
const GENERATED_PATH = join(SRC_DIR, "vibe-audit-event-types.generated.ts");

/**
 * The drift gate for `nexus vibe audit list --type`.
 *
 * The CLI cannot depend on `@nexus/types` at runtime, so its copy of the
 * `VibeAuditEventType` enum is generated and committed. That is safe only
 * while something fails when the copy stops matching the schema — otherwise a
 * new event type ships, the feed emits it, and the CLI refuses to filter for a
 * value it is printing on the very next line.
 *
 * The stale copy held 7 of 34 members. Every terminal deploy state was
 * missing, so a watcher written from `--help` could not detect a failure.
 */
describe("VIBE_AUDIT_EVENT_TYPES", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  const fromSchema = parsePrismaEnumMembers(schema, ENUM_NAME);

  it("finds the enum in the Prisma schema", () => {
    // Guards the gate itself. A renamed enum or a moved schema would otherwise
    // yield an empty list on both sides, and every assertion below would pass
    // while checking nothing at all.
    expect(fromSchema.length).toBeGreaterThan(0);
  });

  it("matches the Prisma schema exactly", () => {
    expect([...VIBE_AUDIT_EVENT_TYPES]).toEqual(fromSchema);
  });

  it("has a committed file byte-identical to a fresh render", () => {
    // Catches a hand-edit of the generated module — a reordered entry, a
    // changed doc comment — that the array comparison above cannot see.
    expect(readFileSync(GENERATED_PATH, "utf-8")).toBe(renderGeneratedModule(fromSchema));
  });

  it("covers the event types a deploy watcher must detect", () => {
    // Named explicitly rather than left to the schema comparison: these four
    // are the terminal states of a deploy, and they are the ones whose absence
    // made a failure undetectable. A future refactor that narrows the
    // generated list has to fail on the names, not on a count.
    expect(VIBE_AUDIT_EVENT_TYPES).toContain("DEPLOYMENT_HEALTHY");
    expect(VIBE_AUDIT_EVENT_TYPES).toContain("DEPLOYMENT_FAILED");
    expect(VIBE_AUDIT_EVENT_TYPES).toContain("DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK");
    expect(VIBE_AUDIT_EVENT_TYPES).toContain("DEPLOYMENT_ROLLED_BACK_COST_SAFETY");
  });
});

describe("parsePrismaEnumMembers", () => {
  it("skips doc comments, comments and attributes", () => {
    const schema = [
      "enum Sample {",
      "  /// a doc line",
      "  ALPHA",
      "",
      "  // a plain comment",
      '  BETA @map("beta")',
      '  @@schema("public")',
      "}"
    ].join("\n");
    expect(parsePrismaEnumMembers(schema, "Sample")).toEqual(["ALPHA", "BETA"]);
  });

  it("stops at the closing brace rather than bleeding into the next enum", () => {
    const schema = ["enum First {", "  ONE", "}", "", "enum Second {", "  TWO", "}"].join("\n");
    expect(parsePrismaEnumMembers(schema, "First")).toEqual(["ONE"]);
  });

  it("returns an empty list for an absent enum", () => {
    expect(parsePrismaEnumMembers("enum Other {\n  X\n}", "Missing")).toEqual([]);
  });

  it("does not match an enum whose name merely starts the same", () => {
    const schema = ["enum SampleExtra {", "  WRONG", "}", "enum Sample {", "  RIGHT", "}"].join(
      "\n"
    );
    expect(parsePrismaEnumMembers(schema, "Sample")).toEqual(["RIGHT"]);
  });
});
