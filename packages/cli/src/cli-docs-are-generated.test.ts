/**
 * THE CLI DOCS GATE — both directions, plus the anti-accretion rule.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS SPEC IS IN `packages/cli/src/` AND NOT SOMEWHERE MORE OBVIOUS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 PLACEMENT DECIDES WHETHER A GATE RUNS AT ALL, AND THE OBVIOUS PLACEMENT IS
 * THE DEAD ONE. `scripts/ci-affected.ts` maps `content/` to `@nexus/backend` and
 * `@nexus/frontend` and to nothing else. A docs-only change therefore woke
 * neither the CLI's lint nor its tests: someone hand-edits a generated page, CI
 * is green because no job that could look at it ever ran, and the hand-written
 * copy is back.
 *
 * This spec is useless without the matching line in `EXTRA_PATH_PACKAGES`:
 *
 *     ["content/", "@agent-nexus/cli"]
 *
 * which puts `content/**` into the `test_vitest` and `lint_packages` outputs.
 * That line is part of this change. If it is ever removed, this file keeps
 * passing forever by never being run — the exact shape of
 * `scripts/verify-docs-links.ts`, which checks the same tree, is referenced by a
 * comment in one backend spec, and is invoked by no CI job at all.
 *
 * ── THE TWO DIRECTIONS, WHICH ARE ONE ASSERTION ─────────────────────────────
 *
 * A generated page rots two ways and a single equality catches both:
 *   · A HUMAN EDITED IT. The file no longer matches its projection.
 *   · THE SOURCE MOVED. The projection no longer matches the file.
 * Neither has a distinct signature and neither needs one — the repo's idiom for
 * the freshness half is `regenerate && git diff --exit-code`, and comparing
 * in-process is that check without the working-tree round trip.
 *
 * ── WHY THE ACCRETION HALF SHIPS WITH A LEDGER ──────────────────────────────
 *
 * The rule below is already violated, live, in four pages. A gate that lands RED
 * is reverted by whoever it blocks and then the real rot flows again, so the
 * known violations are counted into {@link ACCRETION_LEDGER} and the count may
 * only ever SHRINK. A ledger entry that matches nothing is itself a failure: a
 * filter whose target is already gone excludes nothing and reads exactly like
 * one still doing its job.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { AUTHORED_FRONTMATTER } from "./docs-page.frontmatter";
import { buildDocNamespaces, type DocNamespace } from "./docs-page.model";
import { GENERATED_MARKER, renderNamespacePage } from "./docs-page.render";
import { buildRootProgram } from "./root-program";

const CLI_DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../../content/docs/cli");
const COMMAND_DOCS = join(CLI_DOCS, "commands");

/**
 * The pages a human writes. Everything else under `commands/` is a projection.
 *
 * DECLARED, never inferred from the frontmatter — inferring it would let a page
 * leave the generated set by deleting one line, which is the edit this gate
 * exists to refuse.
 */
const AUTHORED_PAGES: ReadonlySet<string> = new Set([
  "index",
  "installation",
  "configuration",
  "output-and-input",
  "recipes",
  "troubleshooting",
  // Authored today and carrying a `## Command reference` table it should not.
  // Ledgered below rather than exempted.
  "authentication",
  // STAYS AUTHORED, deliberately. Only its flags table is derivable; its
  // "Environment variables" and "Resolution order" sections are precedence,
  // decided by branching in `config.ts`, and no option list contains them.
  // `buildRootProgram()` exists now, so generating it is POSSIBLE and still
  // wrong — it would trade three missing flag names for the only written
  // account of how a profile, an env var and a flag resolve. The completeness
  // assertion below covers the derivable half instead.
  "global-options"
]);

/**
 * `<Property name="--flag">` — an authored page DECLARING a flag.
 * Mentioning a flag in prose or in an example is fine and is not this shape.
 */
const DECLARED_FLAG = /<Property name="--/g;

/**
 * A table row whose first cell is a backticked `nexus <ns> <sub>` — a per-command
 * reference table. This is the shape the heading detector misses:
 * `authentication.mdx` re-accreted all eight `nexus auth` subcommands as a TABLE,
 * so a scan for `## nexus <ns> <sub>` headings scored it clean.
 */
const COMMAND_TABLE_ROW = /^\|\s*`nexus\s+[a-z][a-z-]*\s+[a-z][a-z-]*[^`]*`\s*\|/gm;

/**
 * Known accretion, measured 2026-08-13. SHRINK-ONLY.
 *
 * `global-options` is NOT exempt — its six declarations are legitimate for its
 * subject, and they are ledgered rather than waived so that they disappear when
 * the page moves to the generated set instead of becoming a permanent hole.
 */
const ACCRETION_LEDGER: Readonly<Record<string, { flags: number; rows: number }>> = {
  authentication: { flags: 3, rows: 8 },
  "global-options": { flags: 6, rows: 0 },
  installation: { flags: 1, rows: 0 },
  "output-and-input": { flags: 6, rows: 0 }
};

const countOf = (source: string, pattern: RegExp): number =>
  (source.match(new RegExp(pattern.source, pattern.flags)) ?? []).length;

describe("CLI docs are generated, and authored pages carry no command reference", () => {
  const pages = existsSync(COMMAND_DOCS)
    ? readdirSync(COMMAND_DOCS).filter((file) => file.endsWith(".mdx"))
    : [];
  const topLevel = existsSync(CLI_DOCS)
    ? readdirSync(CLI_DOCS).filter((file) => file.endsWith(".mdx"))
    : [];

  /**
   * Built ONCE. The walk imports every module in `src/commands/`, which costs
   * ~4s — over vitest's 5s default on a loaded machine, and it was called from
   * two separate cases, so the suite paid it twice and went red on a TIMEOUT
   * with nothing wrong. A gate that flakes is a gate somebody switches off, so
   * the cost is paid once here and the hook carries an explicit budget.
   */
  let namespaces: DocNamespace[] = [];
  beforeAll(async () => {
    namespaces = await buildDocNamespaces();
  }, 60_000);

  // ── Anti-vacuity. Every assertion below is satisfied by an empty scan, and an
  // empty scan reports success identically to a clean one. ────────────────────

  it("finds the docs tree it is supposed to guard", () => {
    expect(existsSync(CLI_DOCS)).toBe(true);
    expect(pages.length).toBeGreaterThan(30);
    expect(topLevel.length).toBeGreaterThan(5);
  });

  it("every declared authored page exists on disk", () => {
    const missing = [...AUTHORED_PAGES].filter(
      (name) => !existsSync(join(CLI_DOCS, `${name}.mdx`))
    );
    expect(missing).toEqual([]);
  });

  it("the projection produces a real population", () => {
    expect(namespaces.length).toBeGreaterThan(40);
    expect(namespaces.every((n) => n.commands.length >= 0)).toBe(true);
  });

  // ── Direction 1 + 2: hand-edited, and stale. One equality. ──────────────────

  it("every page marked generated matches a fresh projection", () => {
    const byName = new Map(namespaces.map((n) => [n.name, n]));

    const drifted: string[] = [];
    let examined = 0;
    for (const file of pages) {
      const name = file.replace(/\.mdx$/, "");
      const source = readFileSync(join(COMMAND_DOCS, file), "utf8");
      if (!source.includes(GENERATED_MARKER)) continue;
      examined += 1;

      const namespace = byName.get(name);
      if (namespace === undefined) {
        drifted.push(`${file} is marked generated but no namespace "${name}" exists in the tree`);
        continue;
      }
      if (renderNamespacePage(namespace) !== source) {
        drifted.push(
          `${file} does not match a fresh projection — it was hand-edited, or its source moved`
        );
      }
    }

    // 🚨 THE ANTI-VACUITY CONTROL FOR THIS CASE, AND IT IS NOT DECORATION.
    // Proven by mutation: pointed at a directory that does not exist, this case
    // went GREEN — `pages` was empty, the loop never ran, and an empty scan
    // reports success identically to a clean one. The suite still failed, on the
    // three cases above; this line is what makes THIS case fail too, so the
    // reason a reader sees is the real one.
    //
    // RATCHET, upward. 32 pages are projections today. It rises with the
    // migration and must never fall — a page silently leaving the generated set
    // is the regression this number exists to refuse.
    expect(examined).toBeGreaterThanOrEqual(44);
    expect(drifted).toEqual([]);
  });

  it("no page marked generated has silently left the generated set", () => {
    // A generated page keeps its marker. Losing it is how a projection becomes a
    // hand-written copy again with a one-line diff and a green build.
    const orphaned = pages
      .map((file) => file.replace(/\.mdx$/, ""))
      .filter((name) => !AUTHORED_PAGES.has(name))
      .filter((name) => {
        const source = readFileSync(join(COMMAND_DOCS, `${name}.mdx`), "utf8");
        return !source.includes(GENERATED_MARKER);
      });

    // RATCHET, downward. 39 → 2. Both survivors are REFUSALS with an argument,
    // not leftovers: `agent-eval`, whose projection repeats a FALSE claim three
    // times that the authored page does not make, and `agent-skill`, the one
    // page materially better than its projection — it is the only place carrying
    // the packaging rules, the size limits and the scopes. Each drops to 0 when
    // its content lands in the CLI source. Reaches 0, never rises.
    expect(orphaned.length).toBeLessThanOrEqual(2);
  });

  // ── The consumer contract: frontmatter, and reachability. ───────────────────

  it("every namespace has authored frontmatter, so none falls back to a terse default", () => {
    const missing = namespaces
      .map((n) => n.name)
      .filter((name) => AUTHORED_FRONTMATTER[name] === undefined);
    expect(missing).toEqual([]);
  });

  it("every page under commands/ carries the keys its consumers read", () => {
    // Enumerated from the corpus as it stood before the migration: title,
    // description and section are on 48/48 pages and icon on 47/48. All four
    // are read by `docs-content.ts` into `DocPage.frontmatter` and flow to the
    // nav sidebar, every <Card>, the ZeroEntropy index and the `llms-full.txt`
    // blockquote. `docs-content` defaults each one, so a missing key does not
    // throw anywhere — it renders as an empty subtitle or a missing icon, which
    // reads as a design choice rather than as a bug.
    const required = ["title:", "description:", "icon:", "section:"];
    const broken: string[] = [];
    for (const file of pages) {
      const source = readFileSync(join(COMMAND_DOCS, file), "utf8");
      const front = source.split("---")[1] ?? "";
      for (const key of required) {
        if (!front.includes(`\n${key}`)) broken.push(`${file} is missing \`${key}\``);
      }
    }
    expect(broken).toEqual([]);
  });

  it("every page under commands/ is reachable from navigation.json", () => {
    // 🚨 THE DARK-PAGE TRAP, AND IT FAILS IN THE WORST DIRECTION.
    // `docs-content.getAllDocs()` walks `navigation.json`, NOT the filesystem —
    // so a page absent from the nav is served by nothing: no docs route, no
    // `llms-full.txt`, no `sitemap.xml`, no docs search.
    //
    // But `scripts/sync-docs-to-zero-entropy.ts` DOES walk the filesystem,
    // skipping only `images/`. So an unlisted page is pushed to the CUSTOMER
    // SEARCH INDEX with a `https://gpt.nexus/docs/...` URL that 404s. Indexed
    // and unreachable is strictly worse than absent, and nothing else checks it.
    const nav = readFileSync(join(CLI_DOCS, "../navigation.json"), "utf8");
    const dark = pages
      .map((file) => file.replace(/\.mdx$/, ""))
      .filter((name) => !nav.includes(`"cli/commands/${name}"`));
    expect(dark).toEqual([]);
  });

  it("global-options.mdx names every program-level flag, beyond its ledger", () => {
    // 🔴 THIS PAGE STAYS AUTHORED. THIS IS A COMPLETENESS CHECK, NOT A STEP
    // TOWARDS GENERATING IT.
    //
    // Once `buildRootProgram()` existed it looked like the obvious next page to
    // project. It is not: only the flags table is derivable. "Environment
    // variables" and "Resolution order — which credential is used, which API
    // base URL is used" are PRECEDENCE, decided by branching in `config.ts`, and
    // no option list contains them. Generating the page would trade three
    // missing flag names for the only written account of how a profile, an env
    // var and a flag resolve against each other. That is the "uniformly true and
    // strictly less useful" regression, and no equality gate can see it.
    //
    // So the derivable half gets an assertion and the authored half is left
    // alone: the page must NAME every flag the root program declares.
    const page = readFileSync(join(CLI_DOCS, "global-options.mdx"), "utf8");

    // Measured 2026-08-13. SHRINK-ONLY: delete a name here in the same commit
    // that documents it. An entry for a flag the page already covers is itself a
    // failure — a filter whose target is gone excludes nothing and reads exactly
    // like one still doing its job.
    const UNDOCUMENTED_LEDGER = new Set(["--dashboard-url", "--timeout", "--auto-update"]);

    const flags = buildRootProgram()
      .options.map((option) => option.long)
      .filter((long): long is string => typeof long === "string");

    // Anti-vacuity: an empty flag list would satisfy every assertion below.
    expect(flags.length).toBeGreaterThan(5);

    expect(flags.filter((flag) => !page.includes(flag) && !UNDOCUMENTED_LEDGER.has(flag))).toEqual(
      []
    );
    expect(
      [...UNDOCUMENTED_LEDGER].filter((flag) => !flags.includes(flag) || page.includes(flag))
    ).toEqual([]);
  });

  // ── Direction 3: re-accretion into an authored page. ────────────────────────

  it("an authored page declares no per-command reference beyond its ledger", () => {
    const over: string[] = [];
    for (const name of AUTHORED_PAGES) {
      const source = readFileSync(join(CLI_DOCS, `${name}.mdx`), "utf8");
      const flags = countOf(source, DECLARED_FLAG);
      const rows = countOf(source, COMMAND_TABLE_ROW);
      const allowed = ACCRETION_LEDGER[name] ?? { flags: 0, rows: 0 };

      if (flags > allowed.flags) {
        over.push(`${name}.mdx declares ${flags} flags, ledger allows ${allowed.flags}`);
      }
      if (rows > allowed.rows) {
        over.push(`${name}.mdx has ${rows} command-table rows, ledger allows ${allowed.rows}`);
      }
    }
    expect(over).toEqual([]);
  });

  it("the accretion ledger shrinks and never goes stale", () => {
    const stale: string[] = [];
    for (const [name, allowed] of Object.entries(ACCRETION_LEDGER)) {
      const source = readFileSync(join(CLI_DOCS, `${name}.mdx`), "utf8");
      const flags = countOf(source, DECLARED_FLAG);
      const rows = countOf(source, COMMAND_TABLE_ROW);

      // A ledger entry larger than reality excludes nothing and reads exactly
      // like one still doing its job. Tighten it in the same commit that fixes
      // the page.
      if (flags < allowed.flags) {
        stale.push(
          `${name}.mdx now declares ${flags} flags — lower the ledger from ${allowed.flags}`
        );
      }
      if (rows < allowed.rows) {
        stale.push(`${name}.mdx now has ${rows} rows — lower the ledger from ${allowed.rows}`);
      }
    }
    expect(stale).toEqual([]);
  });
});
