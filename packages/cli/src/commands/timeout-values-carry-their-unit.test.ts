import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * NEX-3707: a number carrying no unit crossed a boundary.
 *
 * `createClient({ timeout })` takes SECONDS — the unit of the global
 * `--timeout <seconds>` flag it is spread from. Every HTTP transport underneath
 * takes MILLISECONDS. `prompt-assistant chat` handed the seconds parameter a
 * constant named `PROMPT_ASSISTANT_TIMEOUT_MS`, so the value was multiplied by
 * 1000 twice; Node clamps a timer past 2^31-1 ms to 1 ms, and every invocation
 * aborted before its request left the machine.
 *
 * Nothing typechecked that: both units are `number`, and the docblock saying
 * SECONDS was already there and was already right. A docblock is not a gate, so
 * this is one.
 *
 * The rule this pins is the CONVENTION that makes the unit visible at the call
 * site, in both directions:
 *
 *   - a `timeout:` handed to `createClient` is SECONDS — it must read the global
 *     flag, and any constant it falls back to must be named `*_SECONDS`;
 *   - every other `timeout:` property is MILLISECONDS — it must come out of
 *     `timeoutSecondsToMs(...)` or be named `*_MS`.
 *
 * So a `*_MS` constant in the seconds slot, or a `*_SECONDS` constant in a
 * millisecond slot, is a build failure rather than a silent instant abort.
 *
 * 🔴 THIS GATE IS NOT MADE REDUNDANT BY THE BRANDED `Seconds` TYPE, and deleting
 * it because the type exists would reopen half the class.
 *
 * Commander types its option bag with an `any` index signature, so
 * `globals.timeout ?? SOME_MS_CONSTANT` is `any` and satisfies the brand
 * silently — the type cannot see it. This scan can, because it reads the NAME.
 * The type covers what a name cannot: an unnamed literal such as `7_200_000`,
 * which no naming rule will ever match. Neither instrument subsumes the other,
 * and only this one enforces the third rule at all — that a command default
 * keeps reading `globals.timeout`, so the CLI's own error hint stays true.
 *
 * The type also fires in the editor while this fires in CI. Both matter; they
 * reach different people at different moments. See
 * `../timeout-unit-is-in-the-type.test.ts`.
 */

const SRC_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** The unit-changing helper. Its own body owns the overflow refusal. */
const CONVERTER = "timeoutSecondsToMs";

/** The one receiver whose `timeout` option is documented in seconds. */
const SECONDS_RECEIVER = "createClient";

const SECONDS_SUFFIX = "_SECONDS";
const MS_SUFFIX = "_MS";

/** Files a rule about production wiring must not read. */
function isExcluded(rel: string): boolean {
  return rel.endsWith(".test.ts") || rel === "skills-content.generated.ts";
}

function sourceFiles(dir = SRC_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

interface TimeoutSite {
  /** `<relative path>:<line>`, so a failure names the line to open. */
  readonly where: string;
  /** The call or `new` this object literal is an argument to, if any. */
  readonly receiver: string;
  /** The initializer's source text, whitespace collapsed. */
  readonly value: string;
}

/** Every `timeout:` property assignment in the CLI's production sources. */
function collectTimeoutSites(): TimeoutSite[] {
  const sites: TimeoutSite[] = [];

  for (const file of sourceFiles()) {
    const rel = relative(SRC_DIR, file);
    if (isExcluded(rel)) continue;

    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === "timeout") {
        const literal = node.parent;
        const outer = literal.parent;
        let receiver = "";
        if (ts.isCallExpression(outer) && outer.arguments.includes(literal)) {
          receiver = outer.expression.getText(source);
        } else if (ts.isNewExpression(outer) && outer.arguments?.includes(literal)) {
          receiver = `new ${outer.expression.getText(source)}`;
        }
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        sites.push({
          where: `${rel}:${line}`,
          receiver,
          value: node.initializer.getText(source).replace(/\s+/g, " ")
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return sites;
}

/** Identifier-shaped words in an expression, so a constant's suffix is readable. */
function identifiersIn(expression: string): string[] {
  return expression.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
}

const SITES = collectTimeoutSites();
const SECONDS_SITES = SITES.filter((s) => s.receiver === SECONDS_RECEIVER);
const MS_SITES = SITES.filter((s) => s.receiver !== SECONDS_RECEIVER);

describe("a timeout value names its unit at the boundary it crosses", () => {
  it("finds timeout wiring at all — the scan is alive in both classes", () => {
    // Without this the two rules below pass over an empty set, which is what a
    // broken walker and a clean tree look like from the outside.
    expect(SECONDS_SITES.length).toBeGreaterThan(0);
    expect(MS_SITES.length).toBeGreaterThan(0);
  });

  it(`every ${SECONDS_RECEIVER} timeout is seconds, and never a *${MS_SUFFIX} constant`, () => {
    const offenders = SECONDS_SITES.filter((site) =>
      identifiersIn(site.value).some((word) => word.endsWith(MS_SUFFIX))
    ).map((site) => `${site.where} -> ${site.value}`);

    expect(offenders).toEqual([]);
  });

  it(`every ${SECONDS_RECEIVER} timeout falls back to a *${SECONDS_SUFFIX} constant`, () => {
    const offenders = SECONDS_SITES.filter(
      (site) => !identifiersIn(site.value).some((word) => word.endsWith(SECONDS_SUFFIX))
    ).map((site) => `${site.where} -> ${site.value}`);

    expect(offenders).toEqual([]);
  });

  it("every command default still lets the global --timeout override it", () => {
    // The CLI's own timeout error tells the user to raise `--timeout <seconds>`.
    // A command that pins its own value unconditionally makes that hint false.
    const offenders = SECONDS_SITES.filter((site) => !/\bglobals\.timeout\b/.test(site.value)).map(
      (site) => `${site.where} -> ${site.value}`
    );

    expect(offenders).toEqual([]);
  });

  it(`every other timeout is milliseconds — ${CONVERTER}(...) or a *${MS_SUFFIX} constant`, () => {
    const offenders = MS_SITES.filter((site) => {
      const words = identifiersIn(site.value);
      const converted = words.includes(CONVERTER);
      const namedMs = words.some((word) => word.endsWith(MS_SUFFIX));
      return !converted && !namedMs;
    }).map((site) => `${site.where} (${site.receiver || "no call receiver"}) -> ${site.value}`);

    expect(offenders).toEqual([]);
  });

  it(`no millisecond slot is fed a *${SECONDS_SUFFIX} constant`, () => {
    const offenders = MS_SITES.filter((site) =>
      identifiersIn(site.value).some((word) => word.endsWith(SECONDS_SUFFIX))
    ).map((site) => `${site.where} -> ${site.value}`);

    expect(offenders).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `AbortSignal.timeout(...)` — the same class, through a shape the scan above
// structurally cannot see.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The scan above walks `timeout:` PROPERTY ASSIGNMENTS. `AbortSignal.timeout(N)`
 * is a CALL ARGUMENT, so every one of them was invisible to it — and that is not
 * a hypothetical gap:
 *
 *   `docs.ts` fetched the docs feeds with a hardcoded `AbortSignal.timeout(60_000)`
 *   and never read the global `--timeout`. The feed is ~2.5 MB, so on a slow link
 *   `nexus docs --full` aborted at 60s and the flag that exists for exactly that
 *   could not extend it. The whole rule set above was green the entire time.
 *
 * It is the same defect as NEX-3707's sibling clause — a command holding its own
 * timeout constant instead of reading the configured one — reached by a different
 * syntax. So it is gated in the same file, against the same converter and the same
 * naming rule, rather than in a second place that can drift from this one.
 *
 * `AbortSignal.timeout` takes MILLISECONDS, so the rule is the millisecond rule:
 * the argument comes out of `timeoutSecondsToMs(...)` or is a `*_MS` constant.
 *
 * 🔴 A LEDGER, NOT A CLEAN SWEEP. The sites below are real and still unfixed. They
 * are listed so a NEW one fails rather than joining them silently; the list may
 * only ever shrink. Deleting an entry without fixing its site re-opens the hole.
 */
const ABORT_SIGNAL_TIMEOUT_NOT_YET_CONFIGURABLE: Readonly<Record<string, string>> = {
  "commands/auth.ts": [
    "5 sites at a fixed 30s across the login/device-code/org-switch fetches.",
    "These are interactive auth round-trips against a known-fast endpoint, not",
    "bulk transfers, so the ceiling has not bitten anyone yet — but they ignore",
    "--timeout exactly like the docs feed did. Thread the global and delete this",
    "entry; do not delete it on its own."
  ].join(" ")
};

interface AbortSite {
  readonly where: string;
  readonly file: string;
  readonly value: string;
}

/** Every `AbortSignal.timeout(<arg>)` in the CLI's production sources. */
function collectAbortSignalTimeoutSites(): AbortSite[] {
  const sites: AbortSite[] = [];

  for (const file of sourceFiles()) {
    const rel = relative(SRC_DIR, file);
    if (isExcluded(rel)) continue;

    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "AbortSignal.timeout" &&
        node.arguments.length > 0
      ) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        sites.push({
          where: `${rel}:${line}`,
          file: rel,
          value: node.arguments[0].getText(source).replace(/\s+/g, " ")
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return sites;
}

const ABORT_SITES = collectAbortSignalTimeoutSites();

describe("AbortSignal.timeout reads the configured timeout, not its own constant", () => {
  it("CONTROL: the walker finds AbortSignal.timeout calls at all", () => {
    // A call-expression walker that matches nothing and a codebase with no such
    // calls are the same empty array. Without this the rules below pass vacuously
    // — which is precisely how the property-assignment scan stayed green over
    // this defect.
    expect(ABORT_SITES.length).toBeGreaterThan(0);
  });

  it("every argument is milliseconds — timeoutSecondsToMs(...) or a *_MS constant", () => {
    const offenders = ABORT_SITES.filter((site) => {
      if (site.file in ABORT_SIGNAL_TIMEOUT_NOT_YET_CONFIGURABLE) return false;
      const words = identifiersIn(site.value);
      return !words.includes(CONVERTER) && !words.some((word) => word.endsWith(MS_SUFFIX));
    }).map((site) => `${site.where} -> AbortSignal.timeout(${site.value})`);

    expect(offenders).toEqual([]);
  });

  it("every unlisted site still lets the global --timeout override it", () => {
    // The CLI's timeout error tells the reader to raise `--timeout <seconds>`.
    // A fetch that pins its own deadline makes that instruction false.
    const offenders = ABORT_SITES.filter(
      (site) =>
        !(site.file in ABORT_SIGNAL_TIMEOUT_NOT_YET_CONFIGURABLE) &&
        !/\b(globals|opts)\.timeout\b/.test(site.value)
    ).map((site) => `${site.where} -> AbortSignal.timeout(${site.value})`);

    expect(offenders).toEqual([]);
  });

  it("keeps the ledger honest — every listed file still has an unfixed site", () => {
    // A ledger entry outliving its defect is worse than no ledger: it exempts a
    // file that no longer needs exempting, so the next hardcoded timeout added
    // there passes unnoticed.
    const stale = Object.keys(ABORT_SIGNAL_TIMEOUT_NOT_YET_CONFIGURABLE).filter(
      (file) => !ABORT_SITES.some((site) => site.file === file)
    );

    expect(stale).toEqual([]);
  });
});
