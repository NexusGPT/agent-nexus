import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { shrinkOnlyLedger } from "@nexus/types/testing/shrink-only-ledger";
import { Command } from "commander";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NEX-2760 follow-up: the global --timeout (seconds) must reach EVERY HTTP
// path, and must mean SECONDS everywhere — `nexus api` used to define its own
// --timeout <ms>, so the same flag changed units depending on argv position.
//
// Three CONSTRUCTED transports are driven end-to-end below, each a different
// shape:
//   • `nexus api` builds a raw HttpClient itself           -> httpClientOpts
//   • every ordinary command goes through createClient,
//     which builds a NexusClient                           -> nexusClientOpts
//   • `apps` goes through the tenant transport             -> tenantOpts
//
// `credential` stands in for the createClient path below: an ordinary
// SDK-backed namespace with a no-argument `list` read.
//
// Both constructors are captured, deliberately: an assertion that reads only
// one of the two arrays cannot tell "this command stopped receiving the flag"
// from "this command moved to the other transport", and those call for opposite
// responses.
//
// 🔴 AND THAT LIST OF THREE WAS THE DEFECT, NOT THE COVERAGE. A named list is a
// claim about which paths exist, and it has no way to notice a FOURTH — so the
// whole raw-`fetch` path was outside this file while its header said EVERY. The
// admin tree (ten command files) had no deadline at all; `skill-bundle`,
// `agent-skill download` and `workspace mount` had none either; the `auth` tree
// pinned 30s in four places and ignored the flag. Every one of them was invisible
// here, and every one would have been invisible to a list widened to four.
//
// So the second half of this file is a SCAN, not a list: it walks the package's
// own sources and reports every `fetch(` whose init carries no abort signal. The
// next instance is named on the day it is written rather than on the day someone
// remembers to add a case.

const httpClientOpts: Array<Record<string, unknown>> = [];
const nexusClientOpts: Array<Record<string, unknown>> = [];

vi.mock("@agent-nexus/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-nexus/sdk")>();
  return {
    ...actual,
    HttpClient: class {
      constructor(opts: Record<string, unknown>) {
        httpClientOpts.push(opts);
      }
      requestWithMeta = vi.fn().mockResolvedValue({ data: {}, meta: undefined });
    },
    NexusClient: class {
      constructor(opts: Record<string, unknown>) {
        nexusClientOpts.push(opts);
      }
      // Only the surface the cases below actually drive. A resource this stub
      // does not carry throws, which is the honest outcome: a case reaching for
      // one has changed what it exercises and should say so.
      credentials = {
        list: vi.fn().mockResolvedValue({ data: [], meta: undefined })
      };
    }
  };
});

vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return {
    ...actual,
    resolveBaseUrl: () => "http://localhost:9999",
    resolveApiKey: () => "nxs_test",
    // `createClient` resolves a PROFILE, and the real one throws
    // CLI_NOT_AUTHENTICATED with none configured — which the command catches, so
    // the failure surfaces as "no client was ever built" rather than as an
    // error. Two of the three transports below now go through it.
    resolveProfile: () => ({
      name: "test",
      profile: { apiKey: "nxs_test", baseUrl: "http://localhost:9999" },
      source: "env"
    })
  };
});

const tenantOpts: Array<Record<string, unknown>> = [];
vi.mock("../util/tenant-http", () => ({
  tenantRequest: (opts: Record<string, unknown>) => {
    tenantOpts.push(opts);
    return Promise.resolve({ cluster: null });
  }
}));

import { createClient, parseTimeoutSeconds } from "../client";
import { registerApiCommand } from "./api";
import { registerAppsCommands } from "./apps";
import { registerCredentialCommands } from "./credential";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").option("--timeout <seconds>", "timeout", parseTimeoutSeconds);
  registerApiCommand(program);
  registerAppsCommands(program);
  registerCredentialCommands(program);

  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    spy.mockRestore();
  }
}

describe("global --timeout reaches every HTTP path, always in seconds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    httpClientOpts.length = 0;
    nexusClientOpts.length = 0;
    tenantOpts.length = 0;
  });

  it("nexus api converts the global seconds flag to ms (no local ms flag anymore)", async () => {
    await run(["api", "GET", "/models", "--timeout", "120"]);

    expect(httpClientOpts).toHaveLength(1);
    expect(httpClientOpts[0].timeout).toBe(120_000);
  });

  it("nexus api without the flag leaves the SDK default in charge", async () => {
    await run(["api", "GET", "/models"]);

    expect(httpClientOpts[0].timeout).toBeUndefined();
  });

  it("credential reaches the SDK client with the converted timeout", async () => {
    await run(["--timeout", "90", "credential", "list"]);

    // The MILLISECOND value, asserted where it crosses into the SDK client.
    expect(nexusClientOpts).toHaveLength(1);
    expect(nexusClientOpts[0].timeout).toBe(90_000);

    // POSITIVE, and the half that makes a transport move visible rather than
    // silent: no raw transport is built. Asserting only the line above would
    // stay green if this namespace grew a second, hand-rolled client beside
    // the SDK one.
    expect(
      httpClientOpts,
      "credential must build no transport of its own — it goes through createClient"
    ).toHaveLength(0);
  });

  it("credential without the flag leaves the SDK default in charge", async () => {
    await run(["credential", "list"]);

    expect(nexusClientOpts).toHaveLength(1);
    expect(nexusClientOpts[0].timeout).toBeUndefined();
  });

  it("apps's tenant transport receives the converted timeout", async () => {
    await run(["--timeout", "45", "apps", "cluster", "status"]);

    expect(tenantOpts).toHaveLength(1);
    expect(tenantOpts[0].timeout).toBe(45_000);
  });
});

/**
 * The two options a direct-engine credential refresh needs on the same
 * constructor: the organization PINNED at mount time, which must beat the
 * shell's selector, and a retry count of zero under an external deadline.
 * Captured at the SDK constructor, the same instrument the cases above use.
 */
describe("createClient pins a caller-supplied organization ahead of the shell and the profile", () => {
  const last = (): Record<string, unknown> => nexusClientOpts[nexusClientOpts.length - 1];

  beforeEach(() => {
    nexusClientOpts.length = 0;
    delete process.env.NEXUS_ORGANIZATION_ID;
  });

  it("sends the pinned organizationId even when NEXUS_ORGANIZATION_ID names another org", () => {
    process.env.NEXUS_ORGANIZATION_ID = "org-from-env";
    createClient({ organizationId: "org-pinned" });
    expect(last().organizationId).toBe("org-pinned");
    delete process.env.NEXUS_ORGANIZATION_ID;
  });

  it("CONTROL: with no pin the shared precedence decides, and the env var is first", () => {
    process.env.NEXUS_ORGANIZATION_ID = "org-from-env";
    createClient({});
    expect(last().organizationId).toBe("org-from-env");
    delete process.env.NEXUS_ORGANIZATION_ID;
  });

  it("forwards maxRetries when given and leaves the SDK default in charge otherwise", () => {
    createClient({ maxRetries: 0 });
    expect(last().maxRetries).toBe(0);
    createClient({});
    expect(last().maxRetries).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE RAW-`fetch` PATH — a SCAN, because a list cannot see what it omits.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every `fetch(...)` in this package's production sources must hand its init an
 * abort `signal`. That is the one property a static walk can decide, and it is
 * the property that matters: a `fetch` with no signal cannot be cancelled by
 * anything, so it has no deadline and no ceiling — it waits as long as the
 * socket does, which against a peer that accepts the connection and never
 * answers is for ever.
 *
 * 🔴 WHY THE SIGNAL AND NOT THE DEADLINE'S VALUE. Where the value comes from is
 * already gated, in `timeout-values-carry-their-unit.test.ts`: that file rules
 * on the UNIT and on whether the figure is pinned or configurable. It can only
 * rule on sites it can see, and it sees `timeout:` properties and
 * `AbortSignal.timeout(...)` calls. A `fetch` that passes no signal at all
 * appears in neither, so it was never judged by anything. This scan is the arm
 * that makes a site EXIST for that one; the two compose and neither subsumes the
 * other.
 *
 * ⚠️ IT CANNOT PROVE A SIGNAL IS ARMED, and it does not claim to. A `signal`
 * property satisfies this scan whatever it is bound to — the DEADLINE's honesty
 * is the other gate's job. What this one closes is the case where there is
 * nothing to be honest about.
 */

/** Files a rule about production wiring must not read. Mirrors the unit gate's own list. */
function isExcludedFromFetchScan(rel: string): boolean {
  return rel.endsWith(".test.ts") || rel === "skills-content.generated.ts";
}

function scannedSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...scannedSourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** What the walk could establish about one call's init object. */
type InitVerdict =
  /** No second argument at all — nothing could carry a signal. */
  | "no-init"
  /** An object literal with no `signal` property. */
  | "no-signal"
  /** An object literal carrying `signal`. The healthy case. */
  | "signal"
  /**
   * An init this walk cannot read: an identifier, a spread with no explicit
   * `signal` beside it, a call. NOT a pass — a signal may or may not be in
   * there, and "may" is exactly what a ledger row is for.
   */
  | "opaque";

interface FetchSite {
  /** `<relative path>:<line>`, so a refusal names the line to open. */
  readonly where: string;
  /** `<relative path> -> fetch(<argument source>)`. The ledger key: path alone would exempt a whole file. */
  readonly key: string;
  readonly verdict: InitVerdict;
}

/**
 * Every `fetch`-shaped call in the CLI's production sources.
 *
 * The callee test accepts `fetch`, `globalThis.fetch` and any `<x>.fetch` —
 * INJECTED fetches included. A seam that takes a `fetch` and hands it an init is
 * the same hazard as calling the global one, and excluding it would make "route
 * it through a wrapper" a way out of this gate.
 */
function collectFetchSites(srcDir: string): FetchSite[] {
  const sites: FetchSite[] = [];
  for (const file of scannedSourceFiles(srcDir)) {
    const rel = relative(srcDir, file);
    if (isExcludedFromFetchScan(rel)) continue;
    sites.push(...fetchSitesIn(rel, readFileSync(file, "utf8")));
  }
  return sites;
}

/** The walk over ONE source text, so a fixture can drive the classifier directly. */
function fetchSitesIn(rel: string, text: string): FetchSite[] {
  const sites: FetchSite[] = [];
  {
    const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(source);
        if (callee === "fetch" || callee.endsWith(".fetch")) {
          const init = node.arguments[1];
          let verdict: InitVerdict;
          if (init === undefined) {
            verdict = "no-init";
          } else if (ts.isObjectLiteralExpression(init)) {
            const named = init.properties.some(
              (property) =>
                (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
                property.name.getText(source) === "signal"
            );
            const spread = init.properties.some((property) => ts.isSpreadAssignment(property));
            verdict = named ? "signal" : spread ? "opaque" : "no-signal";
          } else {
            verdict = "opaque";
          }
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          sites.push({
            where: `${rel}:${line}`,
            key: `${rel} -> fetch(${node.arguments
              .map((argument) => argument.getText(source).replace(/\s+/g, " "))
              .join(", ")})`,
            verdict
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return sites;
}

const FETCH_SITES = collectFetchSites(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * 🔴 A SHRINK-ONLY LEDGER OF `fetch` CALLS WHOSE INIT THIS WALK CANNOT READ.
 * Every row's reason must be FALSE for a genuine offender — a row saying only
 * "this is fine" would exempt the next un-deadlined fetch written in the same
 * shape.
 *
 * Both rows are RELAYS: functions whose entire job is to pass a caller's init
 * through to `fetch`. Neither builds an init, so neither can drop a signal —
 * the caller's init arrives whole, signal included. That clause is the one a
 * genuine offender fails: an offender CONSTRUCTS the init it passes, and
 * constructing one without a signal is the defect.
 *
 * Keyed by path AND init source rather than by path alone, so a second,
 * differently-shaped `fetch` in the same file is a NEW key and reds.
 */
const RELAY_FETCHES_CANNOT_DROP_A_SIGNAL: Readonly<Record<string, string>> = {
  "auth-probe.ts -> fetch(url, init)": [
    "The `ProbeFetch` -> real-fetch ADAPTER. It forwards the caller's `init`",
    "unchanged and builds none of its own, and `ProbeFetch`'s own type REQUIRES",
    "`signal: AbortSignal` on that init — so a caller that omits one does not",
    "compile. There is nothing here that could drop a signal."
  ].join(" "),
  "skills-corpus/command.ts -> fetch(input, init)": [
    "The `PlatformIo.fetch` seam, so a test can hand the corpus a double. It",
    "forwards the caller's `init` unchanged and builds none of its own; the one",
    "production caller is `skills-corpus/platform.ts`, which passes an explicit",
    "`signal` this scan reads and judges on its own line. Nothing here can drop",
    "a signal."
  ].join(" ")
};

const RELAY_CEILING = 2;

/**
 * 🔴 HOISTED TO A NAMED CONST, AND NOT FOR READABILITY.
 *
 * `ledger-gates-do-not-refuse-their-cure.test.ts` scans every `.each` table in
 * these trees and classifies where the table came from. Called INLINE inside the
 * `.each` argument, `shrinkOnlyLedger` is an import it cannot open across the
 * package boundary, so the table scores UNRESOLVED — neither clean nor dirty —
 * and that meta-gate's bound on what it is BLIND to goes up by one. Bound to a
 * const here, the table traces to a declaration in this file and the scan can
 * read it. `id-graph.ledger.test.ts` and `source-file-size.ledger.test.ts` are
 * the same shape for the same reason.
 */
const RAW_FETCH_GATE = shrinkOnlyLedger({
  population: "`fetch` calls in packages/cli/src whose init carries no visible abort signal",
  findings: FETCH_SITES.filter((site) => site.verdict !== "signal"),
  keyOf: (site) => site.key,
  locate: (site) => `${site.where}  [${site.verdict}]`,
  ledgerKeys: Object.keys(RELAY_FETCHES_CANNOT_DROP_A_SIGNAL),
  ceiling: RELAY_CEILING,
  remedy:
    "A `fetch` with no abort signal cannot be cancelled, so it has no deadline at all\n" +
    "  and waits as long as the socket does. Pass one:\n" +
    "    · a DOCUMENT (an API envelope, a token, a listing) -> `fetchWithDeadline` in\n" +
    "      util/request-deadline.ts, which bounds the body read as well as the headers;\n" +
    "    · a DOWNLOAD whose size is not knowable in advance -> `downloadWithStallDeadline`\n" +
    "      in util/stall-deadline.ts, which budgets SILENCE so a slow large transfer is\n" +
    "      never aborted for being large;\n" +
    "    · anything else -> `signal: AbortSignal.timeout(timeoutSecondsToMs(globals.timeout)\n" +
    "      ?? SOME_DEFAULT_MS)`, which the unit gate then judges.\n" +
    "  A row here is for a RELAY that forwards a caller's init and builds none of its\n" +
    "  own. If the code under your cursor constructs the init it passes, it is not a\n" +
    "  relay and no row describes it.",
  drainProofControl: {
    // EVERY fetch site, not the unsignalled ones: a site that gains a
    // signal is still a site, so this population survives the cure and
    // its coverage arm gets stronger with each one fixed.
    name: "`fetch`-shaped calls in packages/cli/src, signalled or not",
    keys: FETCH_SITES.map((site) => site.key),
    floor: 8
  },
  rowCheck: {
    name: "every relay row states WHY it cannot drop a signal",
    offender: (key) => {
      const reason = RELAY_FETCHES_CANNOT_DROP_A_SIGNAL[key];
      if (reason === undefined) return `${key} — no reason at all`;
      // A relay's defining property is that it FORWARDS an init. A reason
      // that never says so is not describing a relay, and the row is then
      // an exemption for something else.
      if (!/forward/i.test(reason)) return `${key} — reason does not say it forwards an init`;
      return null;
    }
  }
});

describe("every raw fetch in this package carries an abort signal", () => {
  it("CONTROL: the walk finds fetch calls at all", () => {
    // A call-expression walker that matches nothing and a package with no
    // `fetch` calls are the same empty array, and the empty one passes every
    // arm below. This is what separates them.
    expect(FETCH_SITES.length).toBeGreaterThan(8);
  });

  it("CONTROL: the walk reads object literals — it reports signalled sites", () => {
    // A classifier that returned one constant would look identical to a clean
    // tree. This is the half of that which is drain-proof: fixing a site only
    // ever ADDS a `signal` verdict, so no cure can trip it.
    expect(FETCH_SITES.some((site) => site.verdict === "signal")).toBe(true);
  });

  it("CONTROL: every verdict is reachable, against a fixture rather than the tree", () => {
    // 🔴 ASSERTED ON A FIXTURE ON PURPOSE. The obvious spelling — pin the SET of
    // verdicts the tree produces — reds the day the last `no-signal` site is
    // cured AND reds a second time beside the real refusal when one is added,
    // so it is both a gate refusing its own cure and a duplicate alarm. A
    // fixture asks the same question ("can this classifier tell the four
    // apart") of something no cure can change.
    const verdicts = fetchSitesIn(
      "fixture.ts",
      [
        "fetch(a);",
        "fetch(a, { headers: h });",
        "fetch(a, { signal: s });",
        "fetch(a, init);"
      ].join("\n")
    ).map((site) => site.verdict);

    expect(verdicts).toEqual(["no-init", "no-signal", "signal", "opaque"]);
  });

  it.each(
    eachOrRefuse(
      RAW_FETCH_GATE.checks.map((check) => [check.name, check] as const),
      "the checks shrinkOnlyLedger builds for the raw-fetch scan — a FIXED set of rows, never derived from the ledger, so it cannot empty when the ledger does"
    )
  )("%s", (_name, check) => {
    expect(check.actual, check.message).toEqual(check.expected);
  });

  it("every ledgered relay still exists — a row cannot outlive its site", () => {
    // Not a staleness arm on the FINDINGS (that would red when somebody fixes
    // one, which is the shape shrinkOnlyLedger exists to refuse). This asks the
    // whole POPULATION, which a cure does not leave: a relay that gained a
    // signal is still in FETCH_SITES. What it catches is a row naming a file or
    // a call shape that no longer exists at all — a rename or a deletion —
    // which would silently exempt whatever is written there next.
    const present = new Set(FETCH_SITES.map((site) => site.key));
    const naming_nothing = Object.keys(RELAY_FETCHES_CANNOT_DROP_A_SIGNAL).filter(
      (key) => !present.has(key)
    );

    expect(
      naming_nothing,
      `These rows name a call this package no longer has:\n  ${naming_nothing.join("\n  ")}`
    ).toEqual([]);
  });
});
