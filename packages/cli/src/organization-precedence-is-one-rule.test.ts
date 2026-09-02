import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * WHICH ORGANIZATION A REQUEST ACTS ON IS ONE RULE, AND IT IS WRITTEN TWICE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG (NEX-4621)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The precedence — `NEXUS_ORGANIZATION_ID` first, then the profile's stored
 * `orgId`, then nothing and the key's own organization decides — had FOUR
 * production spellings across `packages/cli` and `packages/mcp-server`. Two of
 * them were hand-rolled copies of the other two:
 *
 *   - `commands/workspace.ts` `actingScope` picked the mount's acting org with
 *     its own `env || profile.orgId`, beside a `createClient` that asked
 *     `resolveOrganization`. A mount recorded against one tenant while the API
 *     calls filling it went to another is not a crash; it is a wrong answer.
 *   - `mcp-server`'s `whoami` printed WHICH selector had answered by re-testing
 *     the environment variable itself, independently of the resolution it was
 *     labelling. That is NEX-2525 exactly: the one surface whose whole job is
 *     saying "which org am I in" deriving its answer a second, separate way.
 *
 * Neither was wrong on the day it was written, and that is the whole problem. A
 * duplicated SELECTION rule does not fail when it drifts — it picks a different
 * tenant, silently, and every type, lint rule and test in both packages stays
 * green.
 *
 * ── WHY A CONTRACT AND NOT A SHARED EXTRACTION ───────────────────────────────
 *
 * The two in-package copies were deleted outright: `workspace.ts` now calls
 * `resolveOrganization`, and `whoami` reads the `source` its own resolver
 * returns. That is the DRY fix and it needed no gate.
 *
 * The cross-PACKAGE copy cannot be deleted the same way, and extracting it is
 * the more expensive answer rather than the purer one:
 *
 *   - `@agent-nexus/cli` and `@agent-nexus/mcp-server` are independently
 *     published npm packages with NO dependency between them, deliberately —
 *     the bridge's runtime dependency list is two entries and its whole value
 *     proposition is that it stays that small.
 *   - They read DIFFERENT stores. The CLI resolves a profile out of its own
 *     config; the bridge reads `~/.nexus-mcp/config.json`. So the shareable
 *     part is not "resolve the org" at all — it is the ORDER of two selectors,
 *     two lines long.
 *
 * Creating a package dependency, or a third package, to share two lines costs
 * more than it saves. So the order is pinned as an executable contract instead:
 * this file reads BOTH functions off disk and fails when their selector
 * sequences stop agreeing. The duplication is declared, and it is checked.
 *
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 *
 * It compares the ORDER of selectors, not the values they produce. Each
 * package's own behavioural specs own that half — `auth-status-organization.
 * test.ts` here, `config.test.ts` in the bridge — and neither of those can see
 * the other package at all, which is why this file exists on top of them.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGES = join(HERE, "..", "..");

const CLI_CONFIG = join(PACKAGES, "cli", "src", "config.ts");
const MCP_CONFIG = join(PACKAGES, "mcp-server", "src", "config.ts");

/** The two files allowed to read the org env var in a value position. */
const SANCTIONED_SELECTORS = ["cli/src/config.ts", "mcp-server/src/config.ts"] as const;

const ORG_ENV_TOKEN = ["process", "env", "NEXUS_ORGANIZATION_ID"].join(".");

/**
 * Drop whole-line comments before a source census.
 *
 * Both files under census are REQUIRED to discuss this env var in prose — the
 * explanation of why the copy exists names it — and a census that reported the
 * explanation as the offence would make the correct docblock unwritable. This
 * is line-level on purpose: every comment in the scanned corpus is a `//` line
 * or a JSDoc continuation, and `commentIsNotCode` below is the two-direction
 * control proving the filter fires on one and not the other.
 */
function codeLinesOf(source: string): string[] {
  return source.split("\n").filter((line) => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
  });
}

/**
 * The statements of one exported function, by name.
 *
 * Sliced from its `export function <name>` line to the first line that is
 * exactly `}` — the file's own formatting, which prettier enforces. A slice
 * that finds no terminator returns `null` rather than the rest of the file, so
 * a rename fails loudly instead of silently widening the region: a region
 * boundary is itself an assertion about where the code lives, and a wrong one
 * fails in the reassuring direction.
 */
function bodyOf(source: string, functionName: string): string[] | null {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`export function ${functionName}(`));
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line === "}");
  if (end === -1) return null;
  return lines.slice(start + 1, end);
}

/**
 * The ordered selector sequence a resolver consults.
 *
 * Derived from FIRST APPEARANCE inside the body, so it captures the thing that
 * actually matters — which selector is asked first — rather than mere presence.
 * The profile pattern is deliberately loose about WHICH store is read (`orgId`
 * off a profile here, off `loadConfig()` there); the stores are legitimately
 * different and the order is the invariant.
 */
function selectorOrderOf(body: string[]): string[] {
  const order: string[] = [];
  for (const line of codeLinesOf(body.join("\n"))) {
    if (!order.includes("env") && line.includes(ORG_ENV_TOKEN)) order.push("env");
    if (!order.includes("profile") && /\borgId\b/.test(line)) order.push("profile");
  }
  return order;
}

/** Every non-test `.ts` file in a package's `src`, relative to `packages/`. */
function sourceFilesOf(packageName: string): string[] {
  const root = join(PACKAGES, packageName, "src");
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}${entry}/`);
        continue;
      }
      if (!entry.endsWith(".ts")) continue;
      if (entry.endsWith(".test.ts")) continue;
      if (entry.includes(".generated.")) continue;
      out.push(`${packageName}/src/${prefix}${entry}`);
    }
  };
  walk(root, "");
  return out;
}

describe("the organization precedence is one rule, written twice on purpose", () => {
  const cliSource = readFileSync(CLI_CONFIG, "utf-8");
  const mcpSource = readFileSync(MCP_CONFIG, "utf-8");

  it("locates both resolvers — a rename is a red, never a silent empty region", () => {
    // Anti-vacuity for every assertion below: an unfound function yields `null`
    // and an empty selector list, which would otherwise compare EQUAL to the
    // other empty list and read as perfect agreement.
    expect(bodyOf(cliSource, "resolveOrganization")).not.toBeNull();
    expect(bodyOf(mcpSource, "resolveOrganization")).not.toBeNull();
  });

  it("consults the env var FIRST and the stored profile SECOND, in both packages", () => {
    const cli = selectorOrderOf(bodyOf(cliSource, "resolveOrganization") ?? []);
    const mcp = selectorOrderOf(bodyOf(mcpSource, "resolveOrganization") ?? []);

    // Stated as a literal rather than `cli === mcp`, so two functions that both
    // drift the SAME way cannot agree their way to green.
    expect(cli).toEqual(["env", "profile"]);
    expect(mcp).toEqual(["env", "profile"]);
    expect(mcp).toEqual(cli);
  });

  it("keeps the bridge's published resolver delegating rather than re-deciding", () => {
    // `resolveOrganizationId` is exported from the bridge's public entry point,
    // so its SIGNATURE is published surface and cannot change. Its BODY can, and
    // a body that re-tests the environment is the copy this ticket removed.
    const body = bodyOf(mcpSource, "resolveOrganizationId");
    expect(body).not.toBeNull();
    expect(selectorOrderOf(body ?? [])).toEqual([]);
    expect((body ?? []).join("\n")).toContain("resolveOrganization()");
  });

  it("reads the org env var in exactly the two sanctioned files", () => {
    const scanned = [...sourceFilesOf("cli"), ...sourceFilesOf("mcp-server")];

    // A floor on the CORPUS, not on the findings — the findings go to zero when
    // the rule is obeyed, so a floor there would refuse its own cure.
    expect(scanned.length).toBeGreaterThan(50);

    const readers = scanned.filter((relative) =>
      codeLinesOf(readFileSync(join(PACKAGES, relative), "utf-8")).some((line) =>
        line.includes(ORG_ENV_TOKEN)
      )
    );

    // Set equality both ways. A NEW reader is a fifth copy of the precedence;
    // a MISSING one means a resolver stopped resolving and something else now
    // decides the tenant.
    expect(readers.sort()).toEqual([...SANCTIONED_SELECTORS].sort());
  });

  it("commentIsNotCode: the comment filter fires on prose and never on a statement", () => {
    // Two directions, because a filter that strips everything and a filter that
    // strips nothing are indistinguishable from inside a green run — and this
    // filter is what stands between the census above and the docblocks that are
    // required to name the variable.
    const prose = ` * falls back when ${ORG_ENV_TOKEN} is unset`;
    const code = `  const fromEnv = ${ORG_ENV_TOKEN};`;

    expect(codeLinesOf(prose)).toEqual([]);
    expect(codeLinesOf(code)).toEqual([code]);
    expect(codeLinesOf(`${prose}\n${code}`)).toEqual([code]);
  });
});
