#!/usr/bin/env tsx
/**
 * Build-time script: emits `src/vibe-audit-event-types.generated.ts` from the
 * `VibeAuditEventType` enum in `packages/prisma-db/schema.prisma`.
 *
 * Run: pnpm --filter @agent-nexus/cli run gen:audit-types
 *
 * Why generate rather than import. `packages/cli` publishes standalone —
 * `@nexus/types` is not a runtime dependency — so the CLI has always mirrored
 * wire types by hand. Hand-mirroring an ENUM the user types on the command
 * line fails differently from hand-mirroring a payload shape: a stale payload
 * field misprints a column, a stale enum REFUSES a value the feed emits, and
 * the operator reads that refusal as "this event does not exist".
 *
 * That is not hypothetical. The hand-written list held 7 of the schema's 34
 * members, so `--type DEPLOYMENT_ROLLED_BACK_HEALTH_CHECK` — the terminal
 * event of a failed deploy — was rejected before any request left the machine,
 * and a deploy watcher built from `--help` was blind to failure.
 *
 * `src/vibe-audit-event-types.test.ts` re-derives the list on every run and
 * fails when the committed file drifts, so a new enum member cannot reach
 * `main` with the CLI still refusing it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENUM_NAME,
  parsePrismaEnumMembers,
  renderGeneratedModule
} from "../src/vibe-audit-event-types.codegen";

const CLI_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCHEMA_PATH = join(CLI_ROOT, "..", "prisma-db", "schema.prisma");
const OUTPUT_PATH = join(CLI_ROOT, "src", "vibe-audit-event-types.generated.ts");

const schema = readFileSync(SCHEMA_PATH, "utf-8");
const members = parsePrismaEnumMembers(schema, ENUM_NAME);
if (members.length === 0) {
  throw new Error(
    `No members found for enum ${ENUM_NAME} in ${SCHEMA_PATH}. Refusing to write an empty ` +
      `enum: the CLI would then reject every --type value it is given.`
  );
}

writeFileSync(OUTPUT_PATH, renderGeneratedModule(members), "utf-8");
console.log(`Wrote ${members.length} ${ENUM_NAME} members to ${OUTPUT_PATH}`);
