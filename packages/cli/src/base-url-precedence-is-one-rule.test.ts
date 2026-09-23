import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * WHICH HOST A REQUEST GOES TO IS ONE RULE, AND IT WAS WRITTEN FIVE WAYS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `organization-precedence-is-one-rule.test.ts` is this file's older sibling and
 * its whole argument applies here unchanged:
 *
 *   > A duplicated SELECTION rule does not fail when it drifts — it picks a
 *   > different tenant, silently, and every type, lint rule and test in both
 *   > packages stays green.
 *
 * Base URL picks a different ENVIRONMENT. The same drift sends a command to
 * production while the surface whose job is to say where you are pointed reports
 * staging, and nothing anywhere goes red.
 *
 * Measured at `7a74f2373f`, against a real binary with a listener on one port and
 * a stored profile naming another:
 *
 *   NEXUS_BASE_URL=<A>  nexus auth status --profile beta   reported <B>
 *   NEXUS_BASE_URL=<A>  nexus agent list  --profile beta   reached  <A>
 *   nexus auth status --base-url <A> --profile beta        reported <B>
 *   nexus agent list  --base-url <A> --profile beta        reached  <A>
 *
 * The third line is the worst of the four: `--base-url` was typed in that very
 * invocation and `auth status` did not read it at all.
 *
 * The five spellings, each of which resolved a host its own way:
 *
 *   1. `config.ts` `resolveBaseUrl(override, profile)` — the canon.
 *   2. `client.ts` — `--base-url` then the ENV then the profile, which is the
 *      canon's second and third terms INVERTED, reaching every SDK-backed
 *      command.
 *   3. `auth/{status,whoami,orgs,use-org}` — `resolved.profile.baseUrl ??
 *      resolveBaseUrl()`, which drops `--base-url` entirely and puts the profile
 *      above the env.
 *   4. `workspace-mount/` / `workspace-unmount.ts` — copies of 2.
 *   5. `auth/login.command.ts` — `resolveBaseUrl()` with no arguments, so the
 *      `--base-url` its own help text tells the reader to use went nowhere.
 *
 * ── WHY A CONTRACT AND NOT ONLY AN EXTRACTION ────────────────────────────────
 *
 * Spellings 2–5 were deleted outright; every one of them now calls the canon.
 * That is the DRY fix and it needed no gate. What needs a gate is the SIXTH
 * spelling nobody has written yet — and the cross-package copy, which cannot be
 * deleted for the reason the org gate already sets out: `@agent-nexus/cli`,
 * `@agent-nexus/mcp-server` and `@agent-nexus/sdk` publish independently, read
 * different stores, and the shareable part is an ORDER rather than a function.
 *
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 *
 *  - It matches env reads TEXTUALLY, in three spellings. A variable reached
 *    through a computed key (`process.env[name]`) is invisible to it — the same
 *    blind spot the org gate declares.
 *  - It compares the ORDER of selectors and the SHAPE of call sites, never the
 *    values they produce. `base-url-precedence.test.ts` owns that half.
 *  - A host resolved from something that is not the profile store and not the
 *    env — a hardcoded literal, say — is caught only if it also calls
 *    `resolveBaseUrl` wrongly. `auth login`'s `--env dev` localhost pair is
 *    exactly that shape, and it is sanctioned below by name.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGES = join(HERE, "..", "..");

const CLI_CONFIG = join(PACKAGES, "cli", "src", "config.ts");
const MCP_CONFIG = join(PACKAGES, "mcp-server", "src", "config.ts");

/**
 * The files allowed to read the base-URL env var in a value position.
 *
 * Three resolvers, one per published package, because the three read different
 * stores: the CLI a named profile out of its own config, the bridge a flat
 * config file, the SDK nothing at all — it is a library whose caller passes the
 * host or accepts the documented default.
 */
const SANCTIONED_ENV_READERS = [
  "cli/src/config.ts",
  "mcp-server/src/config.ts",
  "sdk/src/client.ts"
] as const;

/**
 * The files allowed to read a RESOLVED PROFILE's stored base URL.
 *
 * Exactly one, and this is the arm that catches the spelling with no env var in
 * it at all. `resolved.profile.baseUrl ?? resolveBaseUrl()` reads clean, names
 * no environment variable, and is a complete second precedence — it outranks
 * `NEXUS_BASE_URL` with the profile and drops `--base-url` on the floor. The env
 * census below is structurally blind to it.
 */
const SANCTIONED_PROFILE_BASE_READERS = ["cli/src/config.ts"] as const;

/**
 * Call sites allowed to invoke the canon with fewer than both arguments, and why.
 *
 * Each row is a claim that the dropped argument CANNOT apply at that site, not
 * that dropping it was convenient. A row whose reason would also be true of an
 * ordinary command is a hole.
 */
const SANCTIONED_PARTIAL_CALLERS: Readonly<Record<string, string>> = {
  "cli/src/commands/auth/login.command.ts":
    "login CREATES the profile it is named with, so there is no stored profile to " +
    "read a host from — `--profile` here is the name to save as. The override IS " +
    "passed; only the profile argument is absent."
};

const BASE_URL_ENV_READS = [
  ["process", "env", "NEXUS_BASE_URL"].join("."),
  `process.${"env"}["NEXUS_BASE_URL"]`,
  `getEnv("NEXUS_BASE_URL")`
] as const;

/**
 * Drop whole-line comments before a source census.
 *
 * Every file under census is REQUIRED to discuss these names in prose — this
 * file's own siblings explain the precedence by naming the variable — and a
 * census that reported the explanation as the offence would make the correct
 * docblock unwritable. `commentIsNotCode` below is the two-direction control
 * proving the filter fires on prose and never on a statement.
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
 * exactly `}` — the file's own formatting, which prettier enforces. A slice that
 * finds no terminator returns `null` rather than the rest of the file, so a
 * rename fails loudly instead of silently widening the region: a region boundary
 * is itself an assertion about where the code lives, and a wrong one fails in
 * the reassuring direction.
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
 * The ordered selector sequence a resolver consults, by FIRST APPEARANCE.
 *
 * The patterns are deliberately disjoint, so one statement contributes at most
 * one selector: `resolveProfile({ … })` is the NAMED profile and
 * `resolveProfile()` is whatever the environment says is active, and those two
 * sit on opposite sides of the env var — which is the entire disagreement this
 * file exists to pin.
 */
function selectorOrderOf(body: string[]): string[] {
  const order: string[] = [];
  const add = (name: string): void => {
    if (!order.includes(name)) order.push(name);
  };
  for (const line of codeLinesOf(body.join("\n"))) {
    if (/\boverride\b/.test(line)) add("override");
    if (/resolveProfile\(\{/.test(line)) add("named-profile");
    if (BASE_URL_ENV_READS.some((token) => line.includes(token))) add("env");
    if (/resolveProfile\(\)/.test(line)) add("active-profile");
    if (/\bconfig\.baseUrl\b/.test(line)) add("config-file");
    if (/NEXUS_ENV/.test(line)) add("env-name");
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

/** Files whose CODE lines match `pattern`, over the whole scanned corpus. */
function filesMatching(scanned: readonly string[], pattern: (line: string) => boolean): string[] {
  return scanned
    .filter((relative) =>
      codeLinesOf(readFileSync(join(PACKAGES, relative), "utf-8")).some(pattern)
    )
    .sort();
}

const SCANNED = [...sourceFilesOf("cli"), ...sourceFilesOf("mcp-server"), ...sourceFilesOf("sdk")];

describe("the base URL precedence is one rule", () => {
  const cliSource = readFileSync(CLI_CONFIG, "utf-8");
  const mcpSource = readFileSync(MCP_CONFIG, "utf-8");

  it("locates both resolvers — a rename is a red, never a silent empty region", () => {
    // Anti-vacuity for every order assertion below: an unfound function yields
    // `null` and an empty selector list, which would otherwise compare EQUAL to
    // another empty list and read as perfect agreement.
    expect(bodyOf(cliSource, "resolveBaseUrl")).not.toBeNull();
    expect(bodyOf(mcpSource, "resolveBaseUrl")).not.toBeNull();
  });

  it("puts an explicitly NAMED profile above the ambient env var, in the CLI", () => {
    // Stated as a literal rather than a comparison against another resolver, so
    // two functions that both drift the same way cannot agree their way to green.
    //
    // The order is the decision this PR makes: a flag typed in THIS invocation
    // outranks a variable exported once into a shell, and the env still outranks
    // whatever profile merely happens to be active. `resolveApiKey`,
    // `resolveProfile` and `resolveDashboardUrl` already order it this way, and
    // `resolveDashboardUrl`'s docblock says why in its own words — the host and
    // the dashboard link disagreeing on one invocation is how a user is sent to
    // the wrong environment's console for a thing they just created.
    expect(selectorOrderOf(bodyOf(cliSource, "resolveBaseUrl") ?? [])).toEqual([
      "override",
      "named-profile",
      "env",
      "active-profile",
      "env-name"
    ]);
  });

  it("keeps the bridge's resolver on the same order for the terms it has", () => {
    // The bridge has no `--base-url`, no `--profile` and no profile store, so
    // three of the CLI's five selectors cannot exist here. What CAN agree is the
    // relative order of the ones that do: the env var outranks the stored
    // config, and the NEXUS_ENV map is last.
    expect(selectorOrderOf(bodyOf(mcpSource, "resolveBaseUrlWithSource") ?? [])).toEqual([
      "env",
      "config-file",
      "env-name"
    ]);

    // …and the published entry point holds NO selectors of its own. An order
    // asserted on a delegating one-liner is an order asserted on nothing: this
    // arm was written against `resolveBaseUrl` and went green as `[]` equalling
    // `[]` the moment the body moved, which is the empty-region failure the
    // locator arm above exists to refuse.
    expect(selectorOrderOf(bodyOf(mcpSource, "resolveBaseUrl") ?? [])).toEqual([]);
  });

  it("derives the bridge's whoami LABEL from the resolution it is labelling", () => {
    // NEX-2525 in the base-URL dimension. `whoami` re-tested the environment
    // itself to decide which source to print, independently of the resolver that
    // produced the value beside it — so the label could name one selector while
    // the value came from another. The env census below is what holds this
    // closed; this arm names the function that has to keep delegating.
    const body = bodyOf(mcpSource, "resolveBaseUrlWithSource");
    expect(body).not.toBeNull();
    expect(bodyOf(mcpSource, "resolveBaseUrl")?.join("\n")).toContain("resolveBaseUrlWithSource()");
  });

  it("reads the base-URL env var in exactly the three sanctioned resolvers", () => {
    // A floor on the CORPUS, not on the findings — the findings go to the
    // sanctioned set when the rule is obeyed, so a floor there would refuse its
    // own cure.
    expect(SCANNED.length).toBeGreaterThan(50);

    const readers = filesMatching(SCANNED, (line) =>
      BASE_URL_ENV_READS.some((token) => line.includes(token))
    );

    // Set equality both ways. A NEW reader is a sixth copy of the precedence; a
    // MISSING one means a resolver stopped resolving and something else now
    // decides the environment.
    expect(readers).toEqual([...SANCTIONED_ENV_READERS].sort());
  });

  it("reads a resolved profile's stored base URL in exactly one place", () => {
    expect(SCANNED.length).toBeGreaterThan(50);

    const readers = filesMatching(SCANNED, (line) => /\.profile\.baseUrl\b/.test(line));

    // This is the arm with no env var in it. `resolved.profile.baseUrl ??
    // resolveBaseUrl()` names no environment variable at all, so the census
    // above cannot see it, and it is a complete second precedence.
    expect(readers).toEqual([...SANCTIONED_PROFILE_BASE_READERS].sort());
  });

  it("hands the canon BOTH globals at every call site that has them", () => {
    expect(SCANNED.length).toBeGreaterThan(50);

    // Scoped to the CLI: the bridge's `resolveBaseUrl` is a DIFFERENT function
    // that takes no arguments at all, and judging its call sites by this rule
    // would red every one of them for a flag that package does not have.
    const cliFiles = sourceFilesOf("cli").filter((relative) => relative !== "cli/src/config.ts");

    // `resolveBaseUrl(a, b)` — two arguments, neither of them empty. Anything
    // else is a dropped `--base-url` or a dropped `--profile`, which is how a
    // command silently answers about an environment the user did not ask for.
    const partial = filesMatching(cliFiles, (line) => {
      const call = /resolveBaseUrl\(([^)]*)\)/.exec(line);
      if (!call) return false;
      return call[1].split(",").filter((argument) => argument.trim() !== "").length < 2;
    });

    expect(partial).toEqual(Object.keys(SANCTIONED_PARTIAL_CALLERS).sort());
  });

  it("gives every sanctioned partial caller a reason long enough to read", () => {
    // The reason is prose and a reader is the only check on it. What is
    // mechanical is that one exists and is not a shrug — the same relationship a
    // `debt:` marker has to its ceiling.
    const shrugs = Object.entries(SANCTIONED_PARTIAL_CALLERS)
      .filter(([, reason]) => reason.length < 80)
      .map(([site]) => site);

    // Named, not counted: a bare `toBe(0)` would say a row is too short without
    // saying which, and this table is meant to be read.
    expect(shrugs).toEqual([]);
  });

  it("commentIsNotCode: the comment filter fires on prose and never on a statement", () => {
    // Two directions, because a filter that strips everything and a filter that
    // strips nothing are indistinguishable from inside a green run — and this
    // filter is what stands between the censuses above and the docblocks that
    // are required to name the variable.
    const token = BASE_URL_ENV_READS[0];
    const prose = ` * falls back when ${token} is unset`;
    const code = `  if (${token}) return ${token};`;

    expect(codeLinesOf(prose)).toEqual([]);
    expect(codeLinesOf(code)).toEqual([code]);
    expect(codeLinesOf(`${prose}\n${code}`)).toEqual([code]);
  });
});
