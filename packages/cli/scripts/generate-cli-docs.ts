#!/usr/bin/env tsx
/**
 * Project `content/docs/cli/commands/<namespace>.mdx` from the commander tree
 * and the v1 contract binding.
 *
 * 🚨 RUN IT FROM THE REPO ROOT. `--out` is resolved against the CURRENT WORKING
 * DIRECTORY, and `pnpm --filter <pkg> exec` runs in the PACKAGE directory:
 *
 *   pnpm exec tsx packages/cli/scripts/generate-cli-docs.ts --out content/docs/cli/commands
 *   pnpm exec tsx packages/cli/scripts/generate-cli-docs.ts --check --out content/docs/cli/commands
 *
 * The `pnpm --filter @agent-nexus/cli exec …` spelling this header used to
 * document sent the same relative path to `packages/cli/content/docs/cli/commands`,
 * and both modes then reported a whole tree of nonsense with total confidence:
 * `--check` printed STALE for EVERY namespace and exited 1 — a false red naming
 * 47 pages against a tree with nothing wrong with it — while the write mode
 * created the phantom directory, wrote all 47 pages into it, exited 0 and
 * reported `0 held`. Reproduced 2026-08-14 on a clean checkout.
 *
 * `0 held` is the tell, and it is why the guard below is not a convenience:
 * {@link isHeld} tests a target that DOES NOT EXIST, so the structural hold
 * described below is not weakened by a wrong `--out` — it is absent. Both
 * authored pages were projected.
 *
 * So a `--out` that does not exist is a REFUSAL, in both modes, and this script
 * no longer creates its own output directory. `mkdir` first if you genuinely
 * mean a new one; that makes it a deliberate act rather than a typo's blast
 * radius.
 *
 * `--check` writes nothing and exits 1 on the first page that differs, naming it.
 * That is the freshness half of the gate in script form; the spec beside it is
 * the half CI runs.
 *
 * ── AN AUTHORED PAGE IS HELD, AND THE HOLD IS STRUCTURAL ────────────────────
 *
 * 🚨 THIS SCRIPT USED TO OVERWRITE AN AUTHORED PAGE WITHOUT SAYING SO, and the
 * only thing standing between the documented `--out content/docs/cli/commands`
 * and the loss of a hand-written page was a reviewer remembering. That is a
 * warning where a mechanism belongs, and it was already load-bearing: two pages
 * are deliberately held back today, and running the documented command took
 * both.
 *
 * A page carrying {@link GENERATED_MARKER} is a projection and is rewritten. A
 * page on disk WITHOUT that marker is authored, and this script now leaves it
 * exactly as it found it and names it as HELD. The marker is the same key
 * `cli-docs-are-generated.test.ts` reads to decide which pages it compares, so
 * the writer and the gate cannot disagree about which set a page is in.
 *
 * A page LEAVES the held set by having its content land in the CLI source, and
 * the projection is then adopted in a reviewed pass — never by this script
 * quietly winning a race against the file it was about to delete.
 *
 * The two held today are refusals with an argument, recorded in that spec:
 * `agent-eval`, whose projection repeats a false claim the authored page does
 * not make, and `agent-skill`, the only page carrying the packaging rules, the
 * size limits and the scopes.
 *
 * `--out` still has no default, deliberately: this guard protects an authored
 * page that EXISTS, and nothing protects a directory nobody meant to name.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildDocNamespaces, unattributedHiddenSiblings } from "../src/docs-page.model";
import { GENERATED_MARKER, renderNamespacePage } from "../src/docs-page.render";

/**
 * A page already on disk that does NOT declare itself generated is authored.
 *
 * Absence is the safe direction here and that is not an accident: a target that
 * does not exist yet is NOT held, so a genuinely new namespace still gets its
 * first projection written.
 */
const isHeld = (target: string): boolean =>
  existsSync(target) && !readFileSync(target, "utf8").includes(GENERATED_MARKER);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const outIndex = argv.indexOf("--out");
  const out = outIndex === -1 ? undefined : argv[outIndex + 1];

  if (out === undefined) {
    console.error("REFUSED: --out <dir> is required and has no default.");
    console.error("This guard protects an authored page that EXISTS, and nothing");
    console.error("protects a directory nobody meant to name.");
    process.exit(2);
  }

  // A directory that is not there is a WRONG PATH, never a directory to create.
  // Creating it is what turned one wrong `--out` into 47 phantom pages, `0 held`
  // and exit 0 — see the header. The same absence makes `--check` call every
  // namespace stale, so the refusal covers both modes.
  if (!existsSync(out)) {
    console.error(`REFUSED: --out ${out} does not exist.`);
    console.error(`Resolved against the working directory ${process.cwd()}.`);
    console.error("Run this from the repo root, or mkdir the directory first.");
    process.exit(2);
  }

  const namespaces = await buildDocNamespaces();
  if (namespaces.length === 0) {
    console.error("REFUSED: the tree walk produced 0 namespaces. That is a broken walk,");
    console.error("not an empty CLI — a silent 0 here would write nothing and exit clean.");
    process.exit(1);
  }

  const orphans = await unattributedHiddenSiblings();
  for (const orphan of orphans) {
    console.error(`UNRESOLVED hidden-alias attribution — ${orphan}`);
  }

  let differed = 0;
  let written = 0;
  const held: string[] = [];
  for (const namespace of namespaces) {
    const page = renderNamespacePage(namespace);
    const target = join(out, `${namespace.name}.mdx`);

    // An authored page is not stale and is not rewritten — in BOTH modes. A
    // `--check` that called it stale would report a difference no run of this
    // script is allowed to close, which is a red nobody can act on.
    if (isHeld(target)) {
      held.push(namespace.name);
      continue;
    }

    if (check) {
      const current = existsSync(target) ? readFileSync(target, "utf8") : "";
      if (current !== page) {
        differed += 1;
        console.error(`STALE: ${target} does not match a fresh projection.`);
      }
      continue;
    }
    writeFileSync(target, page);
    written += 1;
  }

  for (const name of held) {
    console.log(`HELD: ${name}.mdx is authored (no \`${GENERATED_MARKER}\`) — left untouched.`);
  }

  console.log(
    `${check ? "checked" : "wrote"} ${check ? namespaces.length - held.length : written} ` +
      `namespace page(s)` +
      (check ? `, ${differed} stale` : "") +
      `, ${held.length} held, ${orphans.length} unresolved attribution(s)`
  );
  if (check && differed > 0) process.exit(1);
}

void main();
