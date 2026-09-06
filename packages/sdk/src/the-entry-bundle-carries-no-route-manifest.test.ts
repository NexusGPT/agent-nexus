import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The main entry must not reach the generated route manifest.
 *
 * ## Why a graph walk and not a byte check on `dist/`
 *
 * The saving this file protects is real and measured — moving
 * `V1_RESPONSE_CONTRACT` off the default path took `dist/index.mjs` from
 * 419,924 raw / 86,246 gzipped to the figures in this PR's description — but the
 * thing that produces it is a property of the SOURCE: `src/index.ts` reaches no
 * module that imports `./response-contract.generated`. Break that property with
 * one import and every consumer pays again.
 *
 * A spec asserting over `dist/` would have to skip when the package has not been
 * built, and a skipped arm is indistinguishable from a passing one — the same
 * reasoning `scripts/assert-declarations.mjs` gives for being a build step
 * rather than a test. This asks the question the build can only answer
 * downstream of, and needs nothing on disk but the sources.
 *
 * ## The over-approximation is deliberate, and it is the safe direction
 *
 * Every `from "…"` specifier is followed, `import type` included. A type-only
 * import emits nothing, so treating it as an edge makes the reachable set LARGER
 * than what a bundler actually walks. That is the direction to buy: a
 * `not.toContain` verdict over a set that is too big is strictly stronger than
 * one over a set that is too small, and it is a set that is too small — a
 * matcher that quietly stopped following a shape of import — that would hand
 * back a clean result for a package that ships the table anyway.
 *
 * Which is why the anti-vacuity arms below are not decoration. A walker that
 * matched nothing would return `{index}` and pass the headline assertion. The
 * controls require the closure to be large, to hold the transport, and to hold
 * the checker the transport uses — and a second walk from the subpath entry has
 * to reach the manifest, or the entry ships nothing and the feature is simply
 * gone rather than moved.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url));

/** Every relative specifier in `text`, whatever import form carries it. */
function relativeSpecifiers(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    // import … from "./x" · export … from "./x" · import type … from "./x"
    /(?<![.\w$])from\s*["'](\.[^"'\n]*)["']/g,
    // import("./x")
    /(?<![.\w$])import\s*\(\s*["'](\.[^"'\n]*)["']/g,
    // require("./x")
    /(?<![.\w$])require\s*\(\s*["'](\.[^"'\n]*)["']/g,
    // bare side-effect import
    /(?:^|[;{}])\s*import\s*["'](\.[^"'\n]*)["']/gm
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** `spec` resolved against `fromFile`, as a path relative to `src/`. */
function resolveModule(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return path.relative(SRC, candidate);
  }
  return null;
}

/** Every module reachable from `entry`, transitively, relative to `src/`. */
function closureFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.pop() as string;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(SRC, rel);
    for (const spec of relativeSpecifiers(fs.readFileSync(abs, "utf8"))) {
      const next = resolveModule(abs, spec);
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

const MANIFEST_MODULE = "response-contract.generated.ts";

describe("the default entry does not carry the v1 route manifest", () => {
  const fromIndex = closureFrom("index.ts");

  it("walks a real graph — the controls that make the verdict below mean anything", () => {
    // A matcher that stopped matching returns {index.ts} and passes the
    // headline assertion silently. These three are what separate "the manifest
    // is unreachable" from "the walker read nothing".
    expect(fromIndex.size).toBeGreaterThan(50);
    expect(fromIndex).toContain("http-client.ts");
    expect(fromIndex).toContain("response-contract.ts");
  });

  it("never reaches the generated manifest", () => {
    // The whole PR, in one assertion. `response-contract.ts` — the checker — is
    // small and stays on the default path; `response-contract.generated.ts` —
    // the table of every route the API publishes — is the caller's to supply.
    expect(fromIndex).not.toContain(MANIFEST_MODULE);
  });

  it("ships the manifest behind its own entry, which does reach it", () => {
    // The other half. Without this arm the feature could be DELETED rather than
    // moved and both assertions above would still pass.
    const fromSubpath = closureFrom("v1-response-contract.ts");
    expect(fromSubpath).toContain(MANIFEST_MODULE);
  });

  it("declares that entry in both places a consumer resolves through", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "..", "package.json"), "utf8")) as {
      exports: Record<string, Record<string, string>>;
    };
    const subpath = manifest.exports["./v1-response-contract"];

    expect(subpath).toBeDefined();
    for (const [condition, target] of Object.entries(subpath)) {
      expect(
        fs.existsSync(path.join(SRC, "..", target.replace(/^\.\//, ""))) ||
          // `dist/` is absent in a clean checkout; assert the SHAPE there, since
          // `assert-declarations.mjs` already proves the files exist post-build.
          target.startsWith("./dist/v1-response-contract."),
        `${condition} -> ${target}`
      ).toBe(true);
    }

    const tsup = fs.readFileSync(path.join(SRC, "..", "tsup.config.ts"), "utf8");
    expect(tsup).toContain('"v1-response-contract": "src/v1-response-contract.ts"');
  });
});
