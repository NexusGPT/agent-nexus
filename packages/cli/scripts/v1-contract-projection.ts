// ⚠️ THE SOURCE, BY RELATIVE PATH — never the `@nexus/types/public-api-v1`
// specifier. See "WHY THIS IMPORT IS NOT THE PACKAGE SPECIFIER" below; changing
// it back reintroduces a false green that no gate in this repo can see.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { ZPublicApiV1 } from "../../types/src/api/public/v1/index";
import { WORKSPACE_SOURCE_ALIASES } from "../src/vitest.aliases";

/** `packages/cli`, the root the alias table's paths are relative to. */
const CLI_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * THE ONE READ of the Public API v1 Zod contract in this package, and it happens
 * at BUILD TIME ONLY.
 *
 * ── Why this file is in `scripts/` and not in `src/` ────────────────────────
 *
 * It was in `src/` for one iteration, named `.conformance.ts` because
 * `wire-types-bundle.test.ts` allows `@nexus/types` under that suffix. That was
 * wrong twice over, and both faults were caught by gates already in this
 * package rather than by reading:
 *
 *   · `zod` is not resolvable from `src/` at all — `packages/cli` publishes
 *     standalone with `commander` as its only runtime dependency. `tsx` resolved
 *     it anyway through pnpm hoisting, so the GENERATOR ran clean while
 *     `tsc --noEmit` refused the import. A phantom dependency that works when you
 *     run it and fails when you build it.
 *   · `request-body-boundary.test.ts` refused the `as unknown as` double cast the
 *     descriptor lookup used. Correctly: the repo bans that shape, and casting
 *     past a guard to reach a contract is precisely the move this whole mission
 *     is trying to delete. The lookup below is a single widening cast plus a real
 *     narrowing check.
 *
 * A build-time script has neither constraint, and the CLI never imports it.

 * ── 🚨 WHY THIS IMPORT IS NOT THE PACKAGE SPECIFIER ─────────────────────────
 *
 * `@nexus/types`' exports map for `./public-api-v1` declares a `node` condition
 * pointing at `dist/` and a `default` pointing at `src/`. `tsx` applies `node`.
 * So `import … from "@nexus/types/public-api-v1"` in this script read the BUILT
 * package, and every value this projection emitted was as old as the last
 * `packages/types` build.
 *
 * That is not merely a staleness risk, it is a FALSE GREEN in the gate that is
 * supposed to catch staleness. `scripts/generated-drift.mjs` re-runs this
 * generator and requires no diff against the committed artifact. Both sides went
 * through the same resolution, so with a stale `dist` the check regenerated stale
 * output, compared it to committed stale output, found no difference, and
 * reported the artifact current. The one condition that makes the gate's input
 * wrong was the one condition the gate could not observe. Measured: with
 * `INSTAGRAM` removed from the built copy only, the drift check passed while the
 * source said otherwise.
 *
 * Reading the source removes the assumption instead of checking it. `dist` is
 * never consulted, so its freshness cannot matter, and the generator works in a
 * fresh clone with nothing built. It also makes this script agree with `tsc`,
 * which already resolves `@nexus/types` through the `default`/source condition
 * here (`moduleResolution: "bundler"`) — before this, typecheck and codegen were
 * reading two different copies of the same contract.
 *
 * TWO ALTERNATIVES WERE WORSE:
 *   · Make the generator depend on a `packages/types` build in the turbo graph.
 *     It only holds for invocations that go through turbo, and `generated-drift`
 *     shells out to `pnpm --filter … run gen:contract-help` directly — as does
 *     anyone running the script by hand. It closes one path and leaves the hole
 *     open in the others, while adding a build to every drift run.
 *   · Assert `dist` is newer than its sources. Git does not preserve mtimes, so
 *     a fresh clone or a branch switch orders them arbitrarily: the check would
 *     fail on correct trees and pass on stale ones. A heuristic guarding a
 *     dependency we can simply not have.
 *
 * `assertSourceMatchesAliasTable()` below keeps the relative path honest.
 *
 * `zod` is a devDependency of `packages/cli`, declared for this script. It never
 * reaches the published binary: `dependencies` is `commander` alone, and
 * `wire-types-bundle.test.ts` asserts that separation. It briefly was NOT
 * declared and resolved anyway, through the realpath of the `@nexus/types`
 * symlink — the generator ran while `require.resolve("zod")` from this directory
 * failed. Declare a dependency you import; a resolution that works only under
 * one runner is not one.
 *
 * The split that falls out is the right one, and it is also cheaper:
 *
 *   · IS THE GENERATED FILE CURRENT WITH THE CONTRACT? → the generator, re-run by
 *     `scripts/generated-drift.mjs`, which needs Zod and has it here.
 *   · DO THE FLAGS AGREE WITH THE GENERATED FILE? → `contract-help.test.ts`,
 *     which compares the live commander tree against the committed data and needs
 *     no Zod at all.
 *
 * ── Why `z.toJSONSchema` and not a hand-rolled Zod walk ──────────────────────
 *
 * Because production already does it this way.
 * `apps/backend/src/public/v1/mcp/infrastructure/catalog/build-tool-input-schema.ts`
 * derives every MCP tool's input schema with exactly the call below, same two
 * options and the same reasons: `io: "input"` describes what the CLIENT sends
 * (the pre-transform shape), and `unrepresentable: "any"` keeps one exotic type
 * from throwing and taking the catalog with it. A second JSON-Schema projection
 * of the same contract would be a second thing to drift, and the CLI would then
 * disagree with the MCP catalog about what an endpoint accepts.
 *
 * A consequence worth stating, because it cuts both ways: this projection
 * inherits that converter's faults. `ListDeploymentsParamsSchema.isActive` is
 * `z.preprocess(fn, z.boolean().optional())` — the `.optional()` is INSIDE the
 * preprocess, so the outer pipe is not optional and both this projection and the
 * live `deployment_list` MCP tool report `isActive` as REQUIRED. That is a real
 * defect in the schema, surfaced rather than papered over: see the `requiredKeys`
 * note in `contract-help.codegen.ts`.
 */
/**
 * The data shapes live in the PURE module, not here.
 *
 * `contract-help.render.ts` is runtime-safe and reachable by anything; this
 * module is reachable by almost nothing, because it imports `@nexus/types`.
 * Declaring the types there and producing them here points the dependency the
 * safe way: a consumer of the shape never has to reach a module that pulls Zod
 * in order to name it.
 */
import {
  type ProjectedDescriptor,
  type ProjectedField,
  type Slot,
  SLOTS
} from "../src/contract-help.render";

export { type ProjectedDescriptor, type ProjectedField, type Slot, SLOTS };

type JsonSchemaNode = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
};

/**
 * A single widening cast, never a double cast through `unknown`.
 *
 * `ZPublicApiV1` composes ~430 descriptors of ~50 differently shaped literal
 * types, so there is no useful named type to index it by. Widening to
 * `Record<string, unknown>` is legal in one step and keeps every lookup
 * `unknown` until `isDescriptor` narrows it, which is the behaviour a double
 * cast would have thrown away.
 */
const DESCRIPTORS = ZPublicApiV1 as Record<string, unknown>;

/** A contract descriptor: an object carrying at least `method` and `path`. */
function isDescriptor(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && "method" in value && "path" in value;
}

/**
 * The relative import above must name the SAME file `vitest.aliases.ts` maps the
 * package specifier to.
 *
 * Two resolutions of one contract already caused this file's worst bug. That
 * table is the repo's single answer to "where is the source of a workspace
 * package", `vitest.config.ts` and `workspace-imports-stay-aliased.test.ts`
 * already read it, and a relative path that quietly stops agreeing with it puts
 * the generator back on a different copy from everything else. Throws rather
 * than warns: a warning on a build-time script scrolls past.
 */
function assertSourceMatchesAliasTable(): void {
  const declared = WORKSPACE_SOURCE_ALIASES["@nexus/types/public-api-v1"];
  if (declared === undefined) {
    throw new Error(
      `WORKSPACE_SOURCE_ALIASES no longer declares "@nexus/types/public-api-v1". This script ` +
        `imports the contract source by relative path and that table is what keeps the path honest.`
    );
  }

  // The table's paths are relative to the PACKAGE ROOT; this file sits in `scripts/`.
  const fromTable = resolve(CLI_ROOT, declared);
  const imported = resolve(CLI_ROOT, "..", "types", "src", "api", "public", "v1", "index.ts");

  if (fromTable !== imported) {
    throw new Error(
      `The contract source moved. This script imports:\n  ${imported}\n` +
        `WORKSPACE_SOURCE_ALIASES declares:\n  ${fromTable}\n` +
        `Point the import at the declared path, or the generator reads a different copy of the ` +
        `contract from the one vitest and tsc read.`
    );
  }

  if (!existsSync(imported)) {
    throw new Error(`The contract source does not exist at ${imported}.`);
  }
}

assertSourceMatchesAliasTable();

/** Every descriptor key the contract composes, sorted. Ordering is never left to iteration. */
export function descriptorNames(): string[] {
  return Object.keys(DESCRIPTORS).sort();
}

function convert(schema: z.ZodType): JsonSchemaNode {
  const generated = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  const { $schema: _dialect, ...rest } = generated as JsonSchemaNode & { $schema?: unknown };
  return rest;
}

/**
 * Collapse a union down to its single object/enum arm when there is exactly one.
 *
 * `z.optional` and `z.nullable` are the common producers, and without this every
 * optional object reads as `type: undefined` and its children vanish. A union
 * with two real arms is left alone and reported as `unknown` — guessing which
 * arm a reader meant is how a generator starts inventing.
 */
function unwrapSingleArm(node: JsonSchemaNode): JsonSchemaNode {
  const arms = node.anyOf ?? node.oneOf;
  if (!arms) return node;
  const meaningful = arms.filter((arm) => arm.type !== "null");
  return meaningful.length === 1 ? { ...meaningful[0], ...stripUnion(node) } : node;
}

function stripUnion(node: JsonSchemaNode): JsonSchemaNode {
  const { anyOf: _a, oneOf: _o, ...rest } = node;
  return rest;
}

const MAX_DEPTH = 4;

function walk(
  node: JsonSchemaNode,
  slot: Slot,
  prefix: string,
  depth: number,
  out: ProjectedField[]
): void {
  if (depth > MAX_DEPTH) return;
  const resolved = unwrapSingleArm(node);
  const required = new Set(resolved.required ?? []);

  for (const [key, rawChild] of Object.entries(resolved.properties ?? {})) {
    const child = unwrapSingleArm(rawChild);
    const path = prefix === "" ? `${slot}.${key}` : `${prefix}.${key}`;
    const type = Array.isArray(child.type) ? child.type.join("|") : (child.type ?? "unknown");

    const enumValues = child.enum?.every((v) => typeof v === "string")
      ? (child.enum as string[])
      : undefined;

    const isObject = type === "object";
    const childProps = Object.keys(child.properties ?? {}).length;

    out.push({
      path,
      slot,
      type,
      required: required.has(key),
      depth,
      ...(enumValues ? { enumValues } : {}),
      ...(isObject && childProps === 0 ? { opaque: true } : {})
    });

    if (isObject && childProps > 0) walk(child, slot, path, depth + 1, out);

    if (type === "array" && child.items) {
      const element = unwrapSingleArm(child.items);
      if (element.type === "object") walk(element, slot, `${path}[]`, depth + 1, out);
      else if (element.enum?.every((v) => typeof v === "string")) {
        out.push({
          path: `${path}[]`,
          slot,
          type: element.type === undefined ? "unknown" : String(element.type),
          required: true,
          depth: depth + 1,
          enumValues: element.enum as string[]
        });
      }
    }
  }
}

/**
 * Flatten one descriptor's input schemas.
 *
 * Throws on an unknown name rather than returning an empty projection: an empty
 * result is indistinguishable from a descriptor with no input, and every
 * assertion downstream would pass over nothing.
 */
export function projectDescriptor(name: string): ProjectedDescriptor {
  const descriptor = DESCRIPTORS[name];
  if (!isDescriptor(descriptor)) {
    throw new Error(
      `No descriptor "${name}" in ZPublicApiV1. Known names: ${descriptorNames().join(", ")}`
    );
  }

  const fields: ProjectedField[] = [];
  for (const slot of SLOTS) {
    const schema = descriptor[slot];
    if (!(schema instanceof z.ZodType)) continue;
    walk(convert(schema), slot, "", 0, fields);
  }

  return {
    name,
    method: String(descriptor.method),
    route: String(descriptor.path),
    fields
  };
}

/** Every enum in a descriptor, keyed by the path a binding would name. */
export function enumsOf(descriptor: ProjectedDescriptor): Map<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const field of descriptor.fields) {
    if (field.enumValues) found.set(field.path, field.enumValues);
  }
  return found;
}
