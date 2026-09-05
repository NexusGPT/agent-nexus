/**
 * Fail a package build that produced no type declarations.
 *
 * ── The failure this exists for ─────────────────────────────────────────────
 *
 * `@nexus/types` builds in two halves: tsup writes the JavaScript and cleans
 * `dist/` first, then `tsc -b tsconfig.build.json` writes the declarations. With
 * the buildinfo named `./dist/.tsbuildinfo`, tsup's clean did not match it
 * (tinyglobby, `dot: false`), so it outlived the 1,266 declarations it described.
 * The next `tsc -b` read it, concluded the project was up to date, and emitted
 * NOTHING.
 *
 * The build exited 0. `pnpm build` was green. The package on disk had a complete
 * `dist/` of JavaScript and not one `.d.ts` in it, and the failure surfaced
 * several jobs later as TS6305 in every consumer — a message about the CONSUMER's
 * project references, pointing nowhere near the package that was actually empty.
 *
 * `scripts/typecheck-guards.ts` refuses the dotted filename that caused this. This
 * is the other half, and it is the half that generalises: it does not care WHY the
 * declarations are missing, only that a package which promises them shipped
 * without them. A clean that grows a new glob, a `tsc -b` that skips for some
 * other reason, a botched `outDir` — all of them land here, at the build that
 * produced the empty directory, instead of in a consumer's typecheck.
 *
 * ── Why it is a build step and not a test ──────────────────────────────────
 *
 * It has to run wherever the package is BUILT, and that is three places with
 * nothing in common: a developer's `pnpm build`, the CI `build:packages` inside
 * postinstall, and `RUN cd packages/types && pnpm run build` in
 * `deployment/backend/Dockerfile`. A vitest spec covers none of them. Wired into
 * the build script, the assertion cannot be reached around.
 *
 * Zero dependencies, plain `node`, on purpose: the Docker build stage installs
 * with `--filter @nexus/backend... --ignore-scripts`, and anything this needed to
 * import would be one more thing that can be absent exactly there.
 *
 * Usage, from the package root:
 *   node ../../scripts/assert-declarations.mjs <outDir>
 */
import fs from "node:fs";
import path from "node:path";

/** Every `.d.ts` under `dir`, recursively. */
function declarations(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".d.ts")) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/** Every file under `dir`, recursively, as a repo-relative POSIX path. */
function filesUnder(cwd, dir) {
  const found = [];
  const abs = path.join(cwd, dir);
  if (!fs.existsSync(abs)) return found;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(path.relative(cwd, full).split(path.sep).join("/"));
    }
  };
  walk(abs);
  return found;
}

/** Collect every string value under an exports subpath, keyed by its condition. */
function stringsUnder(node, out = []) {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (typeof node !== "object" || node === null) return out;
  for (const value of Object.values(node)) stringsUnder(value, out);
  return out;
}

/** Only the `types` targets, in declaration order. */
function typesUnder(node, out = []) {
  if (typeof node !== "object" || node === null) return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === "types" && typeof value === "string") out.push(value);
    else typesUnder(value, out);
  }
  return out;
}

const clean = (entry) => entry.replace(/^\.\//, "");

/**
 * Every `types` target the manifest promises, that lives under `outDir`.
 *
 * Read from `exports` rather than listed here, because the manifest is what a
 * consumer actually resolves through. A partial emit — the shape a `rootDir`
 * mistake or a half-finished `tsc` produces — leaves the directory non-empty and
 * one entry point missing, which the count alone would pass.
 *
 * ── Pattern subpaths ("./contracts/*") ─────────────────────────────────────
 *
 * A pattern's `types` target is not a path and never exists on disk, so taking
 * it literally reports every pattern as a missing entry point. Skipping it
 * instead is the failure this whole file exists to prevent, one level down: a
 * pattern is the entry point a consumer resolves through, and an unemitted
 * expansion of it resolves to nothing exactly like an unemitted literal.
 *
 * So a pattern is EXPANDED, from the source side. The same subpath carries a
 * source target (`./src/api/domains/*\/index.ts`); every file that actually
 * matches it is a subpath a consumer can import today, and each one's `*` is
 * substituted into the `types` target. One pattern therefore asserts N
 * declarations rather than one — strictly more than the literal case, and it
 * cannot fall behind the tree, because the expansion is read off the tree.
 *
 * A pattern that expands to NOTHING is reported too: it is a subpath the
 * manifest publishes and nothing can satisfy.
 */
function promisedTypes(manifest, outDir, cwd) {
  const promised = new Set();
  const emptyPatterns = [];

  const record = (entry) => {
    const rel = clean(entry);
    if (rel.startsWith(`${outDir}/`)) promised.add(rel);
  };

  const exports_ = manifest.exports ?? {};
  for (const [subpath, node] of Object.entries(exports_)) {
    const targets = typesUnder(node);
    if (!subpath.includes("*")) {
      for (const t of targets) record(t);
      continue;
    }
    // Source side of this subpath: the target that is not under outDir.
    const source = stringsUnder(node)
      .map(clean)
      .find((s) => !s.startsWith(`${outDir}/`));
    if (source === undefined || !source.includes("*")) {
      // No source pattern to expand from — assert the literal and let it fail
      // loudly rather than silently skipping a published subpath.
      for (const t of targets) record(t);
      continue;
    }
    const [srcPrefix, srcSuffix] = source.split("*");
    const candidates = filesUnder(cwd, srcPrefix.split("/")[0]);
    const captures = candidates
      .filter((f) => f.startsWith(srcPrefix) && f.endsWith(srcSuffix))
      .map((f) => f.slice(srcPrefix.length, f.length - srcSuffix.length))
      .filter((c) => c.length > 0 && !c.includes("*"));
    if (captures.length === 0)
      emptyPatterns.push(`${subpath}  (source pattern ${source} matched nothing)`);
    for (const t of targets) for (const c of captures) record(t.replace("*", c));
  }

  if (typeof manifest.types === "string") record(manifest.types);
  return { promised: [...promised], emptyPatterns };
}

function main() {
  const outDir = process.argv[2];
  if (outDir === undefined) {
    console.error("assert-declarations: usage: node assert-declarations.mjs <outDir>");
    process.exit(2);
  }

  const cwd = process.cwd();
  const manifestPath = path.join(cwd, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const name = manifest.name ?? path.basename(cwd);
  const abs = path.join(cwd, outDir);

  if (!fs.existsSync(abs)) {
    console.error(
      `assert-declarations: ${name} finished its build with no ${outDir}/ at all (${abs}).\n` +
        `  Nothing downstream can resolve this package's types. Check that the build's ` +
        `tsc step ran and wrote where its tsconfig's outDir says.`
    );
    process.exit(1);
  }

  const emitted = declarations(abs);
  if (emitted.length === 0) {
    console.error(
      `assert-declarations: ${name} built ${outDir}/ with ZERO .d.ts files in it.\n` +
        `  The build exited 0 and the package is empty of types, so every consumer will fail\n` +
        `  TS6305 ("Output file ... has not been built from source file ...") — a message about\n` +
        `  the CONSUMER's project references that points nowhere near this package.\n` +
        `  The known cause: a tsBuildInfoFile that tsup's clean does not delete (a dotted\n` +
        `  basename — tinyglobby runs with dot:false), so it outlives the declarations, and\n` +
        `  \`tsc -b\` then reports the project up to date and emits nothing. Check\n` +
        `  compilerOptions.tsBuildInfoFile in this package's build tsconfig; it must live\n` +
        `  inside ${outDir}/ and must NOT start with a dot.`
    );
    process.exit(1);
  }

  const { promised, emptyPatterns } = promisedTypes(manifest, outDir, cwd);
  if (emptyPatterns.length > 0) {
    console.error(
      `assert-declarations: ${name} publishes ${emptyPatterns.length} pattern subpath(s) that\n` +
        `  expand to nothing, so every import through them resolves to nothing:\n` +
        emptyPatterns.map((entry) => `    ${entry}`).join("\n")
    );
    process.exit(1);
  }
  const missing = promised.filter((entry) => !fs.existsSync(path.join(cwd, entry)));
  if (missing.length > 0) {
    console.error(
      `assert-declarations: ${name} emitted ${emitted.length} declaration(s) but ${missing.length}\n` +
        `  entry point(s) named by package.json "exports" are absent:\n` +
        missing.map((entry) => `    ${entry}`).join("\n") +
        `\n  A consumer importing one of those resolves nothing. The emit is PARTIAL, which a\n` +
        `  count of files in ${outDir}/ cannot see — check the build tsconfig's include/exclude\n` +
        `  and rootDir against the paths above.`
    );
    process.exit(1);
  }

  console.log(
    `assert-declarations: ${name} — ${emitted.length} declarations in ${outDir}/, ` +
      `${promised.length} entry point(s) resolved (pattern subpaths expanded from source)`
  );
}

main();
