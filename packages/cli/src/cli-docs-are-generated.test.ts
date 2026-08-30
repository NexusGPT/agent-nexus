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
 * ── DIRECTION 0: THE PAGE EXISTS AT ALL ─────────────────────────────────────
 *
 * 🚨 EVERY FRESHNESS CASE HERE ITERATES THE FILES ON DISK, SO UNTIL THE SET
 * EQUALITY BELOW LANDED, A COMMAND WITH NO PAGE WAS INVISIBLE TO ALL OF THEM.
 * `for (const file of pages)` asks whether each file matches its projection —
 * a question a missing file never enters. That is a control that is silent on
 * the green path: it proves a page that EXISTS was generated and says nothing
 * about a command whose page is ABSENT.
 *
 * `nexus score` shipped with no page and this suite was 14/14 GREEN, verified
 * by holding the page out. So the first case is a SET EQUALITY between the
 * namespaces the walk produces and the `.mdx` files under `commands/` — a
 * command with no page and a page for a command that no longer exists both go
 * RED, because both are the same broken claim that these docs enumerate the CLI.
 *
 * The freshness cases below are downstream of it and stay that way: they get to
 * assume the file is there because this one has already proven it.
 *
 * ── THE TWO DIRECTIONS, WHICH ARE ONE ASSERTION ─────────────────────────────
 *
 * Given the page exists, a generated page rots two ways and a single equality
 * catches both:
 *   · A HUMAN EDITED IT. The file no longer matches its projection.
 *   · THE SOURCE MOVED. The projection no longer matches the file.
 * Neither has a distinct signature and neither needs one — the repo's idiom for
 * the freshness half is `regenerate && git diff --exit-code`, and comparing
 * in-process is that check without the working-tree round trip.
 *
 * ── WHY THE ACCRETION HALF SHIPS WITH A LEDGER ──────────────────────────────
 *
 * The rule below is violated, live, in three pages. A gate that lands RED is
 * reverted by whoever it blocks and then the real rot flows again, so the known
 * violations are counted into {@link ACCRETION_LEDGER} and the count may only
 * ever SHRINK. A ledger entry that matches nothing is itself a failure: a filter
 * whose target is already gone excludes nothing and reads exactly like one still
 * doing its job.
 *
 * ── THE THIRD DIRECTION: A PAGE THAT IS SIMPLY WRONG ────────────────────────
 *
 * Equality catches a generated page that drifted. It says nothing about an
 * AUTHORED one, and the authored pages are where the false claims live, because
 * no projection can correct them and nothing else reads them. Two rules here
 * cover the part of that surface which is derivable: a page claiming to list
 * "the global flags" must list all of them, and it must NAME each one rather
 * than merely contain it as a prefix. The claims that are not derivable —
 * warnings, sequencing, precedence — stay a reader's job by construction.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { AUTHORED_FRONTMATTER } from "./docs-page.frontmatter";
import { buildDocNamespaces, type DocNamespace } from "./docs-page.model";
import { GENERATED_MARKER, renderNamespacePage } from "./docs-page.render";
import { buildRootProgram } from "./root-program";

const CLI_DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../../content/docs/cli");
const COMMAND_DOCS = join(CLI_DOCS, "commands");
const DOCS_ROOT = join(CLI_DOCS, "..");

/**
 * THE ANTI-VACUITY FLOOR, in ONE place. It was three separate `44` literals
 * describing one fact, which is three things to drift and they drifted
 * together: the tree held 50 projections against a floor of 44 and a comment
 * saying 32. A floor six behind is this control switched off for six pages.
 *
 * ⚠️ A FLOOR IS THE RIGHT SHAPE HERE AND AN EXACT PIN IS NOT — the opposite of
 * `GATED_ROUTE_COUNT` in the SDK's v1 response gate, and the difference is
 * measured rather than stylistic. That count is a hand-written array literal, so
 * nothing but a deliberate edit can move it, and its membership changed in 1
 * commit in the 180 days to 2026-08-30. This number counts FILES ON DISK: 52
 * command pages were ADDED in that same window, across 254 commits touching
 * `content/docs/cli/commands/`. Pinning it would red roughly every third day on
 * correct work, and a gate that refuses correct work is removed — after which
 * the real rot flows again.
 *
 * ✅ THE SLACK-REFUSING HALF ALREADY EXISTS IN THIS FILE, which is what makes a
 * floor sufficient here rather than merely convenient. `orphaned.length <= 2`
 * below bounds the COMPLEMENT — command pages carrying no marker — and it
 * ratchets downward on its own: adding a page moves both populations together
 * and leaves it unchanged, while a page losing its marker moves them apart and
 * reds. A bound on `pages.length - examined` was drafted here and DELETED as
 * redundant, verified rather than assumed: `AUTHORED_PAGES` holds only
 * top-level pages, so it intersects `commands/` in nothing and that expression
 * is arithmetically identical to `orphaned.length`. A second surface pinning one
 * contract reads as extra coverage and is extra drift.
 *
 * What raising 44 → 50 buys is therefore a SECOND independent arm on the same
 * regression, not a first: measured by stripping one marker, the floor arm was
 * green at 44 and reds at 50.
 */
const GENERATED_PAGE_FLOOR = 50;

/**
 * Every page `scripts/sync-docs-to-zero-entropy.ts` pushes to the customer
 * search index, as the slug path it pushes it under.
 *
 * DELIBERATELY A COPY OF THAT WALK, not a shared import: the sync script lives
 * at the repo root, outside every package, and `packages/cli` publishes
 * standalone. What keeps the two honest is that this one is the SUPERSET rule —
 * skip `images/`, take every `.md` and `.mdx` — so the sync narrowing its own
 * walk can only ever make this case check pages the index will not receive,
 * which is a harmless direction. A sync that WIDENS past this is the direction
 * that matters, and there is nowhere left to widen to.
 */
function syncedDocPages(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== "images") walk(join(dir, entry.name));
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
        found.push(relative(DOCS_ROOT, join(dir, entry.name)).replace(/\.mdx?$/, ""));
      }
    }
  };
  walk(DOCS_ROOT);
  return found.sort();
}

/**
 * Every slug path `docs-content.getAllDocSlugs()` produces — the tab slugs, plus
 * every entry of every `pages` array at any nesting depth.
 *
 * Modelled on that function rather than on a substring test over the raw JSON.
 * A substring test scores a page reachable because its name appears in some
 * unrelated title, which is a false GREEN on exactly the check this is.
 */
function navigableSlugPaths(): Set<string> {
  interface NavGroup {
    pages?: string[];
    groups?: NavGroup[];
  }
  const nav = JSON.parse(readFileSync(join(DOCS_ROOT, "navigation.json"), "utf8")) as {
    tabs: { slug: string; groups: NavGroup[] }[];
  };

  const slugs = new Set<string>();
  const extract = (groups: NavGroup[]): void => {
    for (const group of groups) {
      for (const page of group.pages ?? []) slugs.add(page);
      extract(group.groups ?? []);
    }
  };
  for (const tab of nav.tabs) {
    slugs.add(tab.slug);
    extract(tab.groups);
  }
  return slugs;
}

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
  // Its `## Command reference` table is gone. It listed 8 of the 10 `nexus auth`
  // subcommands while the generated `commands/auth.mdx` had all 10, which is the
  // reason an authored page carries no command reference in the first place.
  "authentication",
  // STAYS AUTHORED, deliberately. Only its flags table is derivable; its
  // "Environment variables" and "Resolution order" sections are precedence,
  // decided by branching in `config.ts`, and no option list contains them.
  // `buildRootProgram()` exists now, so generating it is POSSIBLE and still
  // wrong — it would trade the only written account of how a profile, an env var
  // and a flag resolve for a uniform list. The completeness assertion below
  // covers the derivable half instead, and it is what closed the three flags
  // this page used to omit.
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
 * Known accretion. SHRINK-ONLY.
 *
 * Three entries have shrunk since it was first measured on 2026-08-13, and each
 * shrink was a page being made TRUE rather than a page being tidied:
 *
 *   · `global-options` is GONE (was `{flags: 6}`). Its flag list is a table now,
 *     because that is the only form in which it can be COMPLETE: three real
 *     program-level flags were missing, and a fourth `<Property>` block would
 *     have needed the ledger to grow.
 *   · `authentication` 8 rows → 0. The table listed 8 of the 10 `nexus auth`
 *     subcommands — `orgs` and `use-org` had been added and never reached it —
 *     while the generated `commands/auth.mdx` had all 10. A stale copy of a
 *     generated page is the whole subject of this file.
 *   · `output-and-input` 6 flags → 5. It documented a `nexus api --timeout <ms>`
 *     that no longer exists and whose unit was wrong by 1000.
 */
const ACCRETION_LEDGER: Readonly<Record<string, { flags: number; rows: number }>> = {
  authentication: { flags: 3, rows: 0 },
  installation: { flags: 1, rows: 0 },
  "output-and-input": { flags: 5, rows: 0 }
};

const countOf = (source: string, pattern: RegExp): number =>
  (source.match(new RegExp(pattern.source, pattern.flags)) ?? []).length;

/**
 * Every long flag the ROOT program declares — the set a page claiming to list
 * "the global flags" has to match.
 *
 * `--help` is deliberately absent: commander keeps it on `_helpOption` rather
 * than in `.options`, so it never appears here and no assertion can demand it.
 * The pages name it anyway, which is correct and is simply not gated.
 */
const programLongFlags = (): string[] =>
  buildRootProgram()
    .options.map((option) => option.long)
    .filter((long): long is string => typeof long === "string");

/**
 * Does the page NAME this flag — as the whole flag, not as a prefix of another?
 *
 * 🚨 `page.includes(flag)` was the first spelling and it fails OPEN in the one
 * direction that matters. Proven by mutation: renaming the page's row to
 * `--timeoutXX` left both completeness cases GREEN, because `"--timeoutXX"`
 * contains `"--timeout"`. A page naming a flag that does not exist is exactly
 * the rot this file is for, and the check could not see it.
 *
 * The reverse direction was already safe and stays so: a flag renamed in the
 * CODE is a new string the page does not contain, which reds.
 */
const namesFlag = (page: string, flag: string): boolean =>
  new RegExp(`(?<![\\w-])${flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(page);

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

  // ── Direction 0: the page EXISTS at all. ────────────────────────────────────

  it("the set of namespaces and the set of pages under commands/ are the same set", () => {
    // 🚨 EVERY OTHER CASE IN THIS FILE ITERATES THE FILES ON DISK, SO A COMMAND
    // WITH NO PAGE IS INVISIBLE TO ALL OF THEM. The equality below this one
    // starts `for (const file of pages)` and asks whether each file matches its
    // projection — a question a missing file never enters. That is a control
    // that is silent on the green path: it proves a page that EXISTS was
    // generated and says nothing about a command whose page is ABSENT.
    //
    // Measured on `origin/staging` at f7ecbc7dca: `nexus score` is a plain,
    // visible `program.command("score")` with two subcommands, a v1 contract
    // binding and an `AUTHORED_FRONTMATTER` entry — and it had no page. Holding
    // `score.mdx` out of the tree left this suite 14/14 GREEN. The CLI's
    // published surface under-reported what the CLI does, and nothing here could
    // say so.
    //
    // ── WHY THIS IS A SET EQUALITY AND NOT TWO SEPARATE ASSERTIONS ───────────
    //
    // The mirror defect costs the same and reads the same to a customer: a page
    // committed for a namespace that no longer exists is a documented command
    // that errors when typed. `sync-docs-to-zero-entropy.ts` walks the
    // FILESYSTEM, so an orphan page keeps being pushed to the customer search
    // index under a `https://gpt.nexus/docs/...` URL long after the command is
    // gone. Both directions are the same claim — the docs enumerate the CLI —
    // so they are one assertion and neither can be tightened without the other.
    //
    // NOT covered by the marker cases below, either. "every page marked
    // generated matches a fresh projection" does report an orphan, but only for
    // a page CARRYING the marker; strip the marker and it falls through to the
    // `orphaned.length <= 2` ratchet, which counts missing markers and never
    // asks whether the namespace exists. A hand-written page for a deleted
    // command satisfies both.
    //
    // The held pages need no exemption: `agent-eval` and `agent-skill` are
    // authored rather than projected, but they are authored pages FOR REAL
    // NAMESPACES, so they belong in this set on both sides. A page earns its
    // place here by naming a command, not by how it was produced.
    const pageNames = pages.map((file) => file.replace(/\.mdx$/, "")).sort();
    const namespaceNames = namespaces.map((n) => n.name).sort();

    // Anti-vacuity, BOTH halves, and neither is optional: two empty sets are
    // equal, so a broken tree walk and a missing docs directory each satisfy the
    // equality below while reading exactly like a clean pass. A uniform result
    // across every row is the shape of a broken instrument, not a clean world.
    expect(namespaceNames.length).toBeGreaterThan(40);
    expect(pageNames.length).toBeGreaterThan(40);

    // Reported as two named lists rather than one set-equality diff: "score has
    // no page" and "score.mdx documents nothing" call for opposite fixes — run
    // the generator, or delete the page — and a bare `toEqual` on two sorted
    // arrays makes the reader work out which direction they are looking at.
    const undocumented = namespaceNames.filter((name) => !pageNames.includes(name));
    const orphaned = pageNames.filter((name) => !namespaceNames.includes(name));

    expect({ undocumented, orphaned }).toEqual({ undocumented: [], orphaned: [] });
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
    // RATCHET, upward. It rises with the migration and must never fall.
    expect(examined).toBeGreaterThanOrEqual(GENERATED_PAGE_FLOOR);

    expect(drifted).toEqual([]);
  });

  it("no generated page names a CLI version, so a release cannot make the tree stale", () => {
    // 🚨 A GENERATED PAGE MUST BE A FUNCTION OF THE TREE ALONE, AND THE VERSION
    // IS NOT IN THE TREE THIS PAGE IS COMPARED AGAINST. `packages/cli/package.json`'s
    // `version` is written by the changesets release, which lands on `main` and
    // never on `staging`. A staging->main promotion is tested on
    // `refs/pull/<n>/merge` — main's package.json beside staging's committed
    // pages — so the equality above went RED on all 45 pages with no CLI file
    // touched, and no regeneration could hold: the next release re-opens it.
    // Measured on PR #3638, and reproduced by editing that one field and
    // nothing else: 0 stale at 0.21.9, 45 stale at 0.25.0.
    //
    // `help-scope.test.ts` pins the mechanism — a derived capture names no
    // version. This pins the RESULT over the whole tree, so a second surface
    // that starts printing one is caught here rather than on a promotion.
    const VERSIONED_CLIENT = /@agent-nexus\/cli\s+\d+\.\d+\.\d+/;

    const generated = pages.filter((file) =>
      readFileSync(join(COMMAND_DOCS, file), "utf8").includes(GENERATED_MARKER)
    );
    const versioned = generated.filter((file) =>
      VERSIONED_CLIENT.test(readFileSync(join(COMMAND_DOCS, file), "utf8"))
    );

    // Anti-vacuity, both halves. An empty population satisfies the assertion,
    // and so does a tree where the scope footer stopped being projected at all —
    // which would delete the surface this rule is about rather than fix it.
    expect(generated.length).toBeGreaterThanOrEqual(GENERATED_PAGE_FLOOR);
    expect(
      generated.filter((file) =>
        readFileSync(join(COMMAND_DOCS, file), "utf8").includes(
          "THIS IS ONE CLIENT (@agent-nexus/cli)"
        )
      ).length
    ).toBeGreaterThanOrEqual(GENERATED_PAGE_FLOOR);

    expect(versioned).toEqual([]);
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

  it("every page the search index will receive is reachable from navigation.json", () => {
    // 🚨 THE DARK-PAGE TRAP, AND IT FAILS IN THE WORST DIRECTION.
    // `docs-content.getAllDocs()` walks `navigation.json`, NOT the filesystem —
    // so a page absent from the nav is in no nav sidebar, no `llms-full.txt` and
    // no `sitemap.xml`.
    //
    // But `scripts/sync-docs-to-zero-entropy.ts` DOES walk the filesystem,
    // skipping only `images/`. So an unlisted page is pushed to the CUSTOMER
    // SEARCH INDEX with a `https://gpt.nexus/docs/...` URL, under a `section`
    // taken from its first path segment. Nothing else checks it.
    //
    // 🚨 THE POPULATION IS THE WHOLE `content/docs` TREE, NOT `commands/`.
    // Scoped to `commands/` this case was green while three files outside it
    // were dark — and one of them, the docs AUTHORING GUIDE, was being pushed to
    // the customer search index as a page named `STYLE`. It is a document about
    // frontmatter keys and the Black Box Rule, written for whoever edits this
    // tree. The fix was to move it OUT of the synced tree (`content/STYLE.md`)
    // rather than to list it: a page nobody should read is not made correct by
    // adding it to the navigation.
    //
    // The other two were `<tab>/index.mdx` landing pages, reachable at the TAB
    // SLUG and not under their own name. That is not an exception carved out for
    // them — it is what `getDocBySlug` does, and this case models the resolver
    // instead of guessing at it.
    const reachable = navigableSlugPaths();
    const dark = syncedDocPages().filter(
      (page) => !reachable.has(page) && !reachable.has(page.replace(/\/index$/, ""))
    );

    // Anti-vacuity, both halves. A walk that found nothing, and a nav parse that
    // resolved nothing, each satisfy `dark === []` while reading exactly like a
    // clean scan.
    expect(syncedDocPages().length).toBeGreaterThan(200);
    expect(reachable.size).toBeGreaterThan(200);
    expect(dark).toEqual([]);
  });

  it("a --out that does not exist is refused, in both modes", () => {
    // 🚨 THE GUARD THIS SCRIPT ADVERTISES IS ABSENT WHEN `--out` IS WRONG, AND
    // BOTH MODES REPORT WITH TOTAL CONFIDENCE. `generate-cli-docs.ts` resolves
    // `--out` against the working directory, and its header used to document a
    // `pnpm --filter … exec` form that runs in `packages/cli`. The same relative
    // path then meant `packages/cli/content/docs/cli/commands`:
    //
    //   · `--check` called EVERY namespace stale and exited 1 — a false red
    //     naming 47 pages against a tree with nothing wrong with it.
    //   · the write mode created the directory, wrote all 47 pages into it and
    //     exited 0 reporting `0 held` — PROJECTING both deliberately-held
    //     authored pages, because `isHeld()` tests a target that does not exist.
    //
    // So the absent directory is refused rather than created, and this case is
    // what stops the refusal being deleted as ceremony.
    const script = join(dirname(fileURLToPath(import.meta.url)), "../scripts/generate-cli-docs.ts");
    const absent = join(CLI_DOCS, "../../../packages/cli/content/docs/cli/commands");
    expect(existsSync(absent)).toBe(false);

    for (const argv of [
      ["--out", absent],
      ["--check", "--out", absent]
    ]) {
      const run = spawnSync("npx", ["tsx", script, ...argv], { encoding: "utf8" });
      expect(run.status).toBe(2);
      expect(run.stderr).toContain("REFUSED");
      expect(existsSync(absent)).toBe(false);
    }
  }, 120_000);

  it("every page that presents THE global flags presents all of them", () => {
    // 🚨 THE ROT THIS CATCHES IS DUPLICATION, NOT ABSENCE. Three authored pages
    // carried a "global flags" list and all three were different subsets of the
    // real one — `index.mdx` had 6 of 9, `global-options.mdx` had 6 of 9 (a
    // DIFFERENT 6), and neither named `--timeout`, whose unit is the difference
    // between a 120-second wait and a 33-hour one. Each list was true when
    // written and none of them was ever read again.
    //
    // Scoped BY HEADING, deliberately. A page saying "Flags that matter in CI"
    // (`recipes.mdx`) is presenting a SUBSET on purpose and completeness would
    // be the wrong demand there; a page saying "Global flags" is claiming to be
    // the list. The heading is the claim, so the heading is the trigger.
    const GLOBAL_HEADING = /^#{2,3}\s+Global (flags|options)\s*$/m;

    const flags = programLongFlags();
    expect(flags.length).toBeGreaterThan(5);

    const claimants: string[] = [];
    const incomplete: string[] = [];
    for (const name of AUTHORED_PAGES) {
      const source = readFileSync(join(CLI_DOCS, `${name}.mdx`), "utf8");
      if (!GLOBAL_HEADING.test(source)) continue;
      claimants.push(name);

      const missing = flags.filter((flag) => !namesFlag(source, flag));
      if (missing.length > 0) {
        incomplete.push(`${name}.mdx omits ${missing.join(", ")}`);
      }
    }

    // Anti-vacuity: a heading rename would empty the population and this case
    // would pass by checking nothing at all.
    expect(claimants.sort()).toEqual(["global-options", "index"]);
    expect(incomplete).toEqual([]);
  });

  it("global-options.mdx names every program-level flag", () => {
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
    // ── THE UNDOCUMENTED LEDGER IS GONE, AND ITS EMPTINESS IS THE RESULT.
    // It held `--dashboard-url`, `--timeout` and `--auto-update` — three real
    // program-level flags this page did not name — and it was shrink-only. All
    // three are on the page now, so the ledger and the filter that read it are
    // deleted rather than left as an empty set: an empty filter excludes nothing
    // and reads exactly like one still doing its job.
    const page = readFileSync(join(CLI_DOCS, "global-options.mdx"), "utf8");

    const flags = programLongFlags();

    // Anti-vacuity: an empty flag list would satisfy the assertion below.
    expect(flags.length).toBeGreaterThan(5);

    expect(flags.filter((flag) => !namesFlag(page, flag))).toEqual([]);
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
