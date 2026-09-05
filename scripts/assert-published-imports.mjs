/**
 * Fail a package build whose published output names a module the consumer cannot
 * resolve.
 *
 * ── The failure this exists for ─────────────────────────────────────────────
 *
 * `@agent-nexus/sdk` is published to npm. `@nexus/types` is `"private": true`
 * and is one of its devDependencies. So a `.d.ts` in the SDK's published output
 * that names `@nexus/types` is broken for everyone who installs the package:
 * there is no such package on the registry and nothing to resolve.
 *
 * Two independent things kept that true, and they agreed by coincidence:
 *
 *   - `packages/sdk/tsconfig.build.json` excludes `**\/*.test.ts` and
 *     `**\/*.conformance.ts` from the declaration build.
 *   - `packages/sdk/src/wire-types-bundle.test.ts` asserts that only files with
 *     those same two suffixes may import `@nexus/types`.
 *
 * Nothing enforced the agreement. Add a third suffix to that spec's
 * `UNPUBLISHABLE` list, put a file with that suffix in `src/`, and the spec is
 * green while `tsc -p tsconfig.build.json` emits a declaration naming a private
 * package. It was masked for a while by a single rolled-up `index.d.ts`; the
 * declaration split that replaced it with per-file declarations made the hazard
 * reachable.
 *
 * ── Why this asserts the INVARIANT and not the two lists ───────────────────
 *
 * A gate comparing `UNPUBLISHABLE` against the tsconfig `exclude` array would be
 * a THIRD copy of the same list, and the next author has three places to keep in
 * step instead of two. It also answers a narrower question than the one that
 * matters: the suffixes are a means, and the end is that the published output
 * resolves.
 *
 * So this reads the artifact. For every file in the published output it collects
 * the module specifiers a consumer would have to resolve, and requires each one
 * to be relative, a Node builtin, or a package the published manifest declares
 * as a runtime dependency. Both sides are derived — the specifiers from the
 * emitted files, the allowed set from `package.json`'s own
 * `dependencies` / `peerDependencies` / `optionalDependencies`. Neither is
 * written down here, so neither can drift.
 *
 * That is strictly wider than the hazard it was built for: it catches a leaked
 * `zod`, a `tsup` type pulled into a signature, and a runtime `require` of a
 * workspace package that tsup externalised — not only `@nexus/types`.
 *
 * ── Why not a grep for the private package's name ──────────────────────────
 *
 * Because it would refuse correct work on day one. Seven of the SDK's 112
 * declarations name `@nexus/types` today, every one inside a JSDoc comment
 * explaining what the hand-written wire type mirrors. A gate that reds on
 * correct prose gets deleted, and then the real leak flows again. A MODULE
 * SPECIFIER is a different thing from the same characters in a sentence, and
 * only the first one has to resolve.
 *
 * ── The population, and the one assumption it declares ─────────────────────
 *
 * What actually ships is `npm pack`'s file list. This walks `<outDir>` instead,
 * which is the same set only while every entry in `package.json`'s `files`
 * array is rooted at `<outDir>/`. That is not left as a comment: if `files`
 * grows an entry outside `<outDir>` this REFUSES, because at that point the scan
 * no longer covers what ships and a green would be a claim about the wrong set.
 *
 * ── Why it is a build step and not a test ──────────────────────────────────
 *
 * The declarations only exist after a build, so a spec asserting over them would
 * have to skip when `dist/` is absent — and a skipped arm is indistinguishable
 * from a passing one. Wired into the `build` script it runs wherever the package
 * is built, `prepublishOnly` included, which is the one path a publish cannot
 * avoid. `scripts/__tests__/published-imports-resolve.spec.ts` covers the
 * predicate itself against synthetic input, which needs no build.
 *
 * Zero dependencies, plain `node`, matching `assert-declarations.mjs` beside it:
 * anything imported here is one more thing that can be absent in a stripped
 * install.
 *
 * Usage, from the package root:
 *   node ../../scripts/assert-published-imports.mjs <outDir>
 */
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

/**
 * File extensions whose contents a consumer resolves through.
 *
 * `.d.ts` is the one the SDK hazard lives in; the JavaScript is here because
 * tsup runs with `skipNodeModulesBundle`, so a runtime `require("@nexus/types")`
 * survives into `dist/index.js` with exactly the same consequence.
 */
const CODE_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts", ".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];

const isCode = (file) => CODE_EXTENSIONS.some((ext) => file.endsWith(ext));

/**
 * `text` with every comment replaced by a space of the same shape.
 *
 * Not cosmetic, and not optional. Measured against the SDK's own 112
 * declarations before this existed: two of the eight things the extractor
 * reported were English — a JSDoc `@example` line reading
 * `import { NexusClient } from "@agent-nexus/sdk"`, and the sentence
 * `... (processing the request) from "the API was unreachable".` A gate that
 * reds on a doc comment is one somebody deletes.
 *
 * A `///` triple-slash reference IS a comment and IS resolved, so it is read
 * out before the strip rather than after.
 *
 * The scanner tracks strings and regex literals as well as comments, because a
 * `//` inside `"https://…"` is not a comment and a `/` that begins a regex is
 * not a division. Mis-reading either direction would drop real code, so the
 * spec beside this pins both.
 */
export function stripComments(text) {
  let out = "";
  let i = 0;
  // The last character that decides whether a `/` divides or opens a regex.
  let lastSignificant = "";
  const closesValue = (ch) => /[)\]}\w$'"`]/.test(ch);

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") {
          out += text.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += text[i];
        if (text[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      lastSignificant = quote;
      continue;
    }
    if (ch === "/" && !closesValue(lastSignificant)) {
      // A regex literal. Copy it whole so its contents cannot be read as code.
      out += ch;
      i += 1;
      let inClass = false;
      while (i < text.length) {
        if (text[i] === "\\") {
          out += text.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (text[i] === "[") inClass = true;
        else if (text[i] === "]") inClass = false;
        out += text[i];
        if (text[i] === "/" && !inClass) {
          i += 1;
          break;
        }
        if (text[i] === "\n") {
          // Not a regex after all — an unterminated one cannot span a line.
          i += 1;
          break;
        }
        i += 1;
      }
      lastSignificant = "/";
      continue;
    }

    out += ch;
    if (!/\s/.test(ch)) lastSignificant = ch;
    i += 1;
  }
  return out;
}

/**
 * Every module specifier in `text`, in the five shapes a consumer resolves.
 *
 * The `import("x")` one carries the SDK hazard and is the one a reader does not
 * expect: TypeScript emits `import("@nexus/types").Foo` inside a `.d.ts`
 * whenever a type is referenced without a named import, so a declaration can
 * name a package that appears in no import statement anywhere.
 *
 * Every keyword carries a `(?<![.\w$])` lookbehind, and it is load-bearing
 * rather than defensive. Without it `this.import("google-drive", params)` — a
 * cloud-import method the SDK really has — reads as a dynamic import of a
 * package called `google-drive`, three times over, in both bundle formats. That
 * was six of the eight findings on the first run of this check against a
 * correct build.
 */
export function moduleSpecifiers(text) {
  const found = [];
  // Read before stripping: a triple-slash reference is itself a comment.
  for (const match of text.matchAll(/\/\/\/\s*<reference\s+types\s*=\s*["']([^"'\n]+)["']/g)) {
    found.push(match[1]);
  }

  const code = stripComments(text);
  const patterns = [
    // import … from "x" · export … from "x" · import type … from "x"
    /(?<![.\w$])from\s*["']([^"'\n]+)["']/g,
    // import("x") — dynamic import, and the type-position `import("x").T`
    /(?<![.\w$])import\s*\(\s*["']([^"'\n]+)["']/g,
    // require("x")
    /(?<![.\w$])require\s*\(\s*["']([^"'\n]+)["']/g,
    // bare side-effect import — anchored to a statement boundary, because the
    // word alone appears inside data. `"POST /documents/imports/:provider/import"`
    // is a real key in the SDK's generated response contract, and an unanchored
    // pattern reads the tail of it as an import of whatever string follows.
    /(?:^|[;{}])\s*import\s*["']([^"'\n]+)["']/gm
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) found.push(match[1]);
  }
  return found.filter(isPlausibleSpecifier);
}

/**
 * Whether `specifier` is shaped like something a resolver could be handed.
 *
 * The patterns above match a KEYWORD next to a QUOTE, and both can occur inside
 * string data that is not code at all. This is the backstop, and it is a
 * statement about specifiers rather than a list of things to ignore: a module
 * specifier is one path-like token, optionally behind a protocol (`node:`), so
 * it carries no whitespace, brackets, commas or bare colons. `": { name: "`,
 * captured out of the generated contract table, fails every one of those.
 *
 * It drops, so it is the direction that manufactures a clean result — the spec
 * beside this pins both halves: a real specifier survives, invented noise does
 * not.
 */
export function isPlausibleSpecifier(specifier) {
  return /^(?:[a-z][a-z0-9+.-]*:)?[^\s"'`(){}[\],;:=<>]+$/i.test(specifier);
}

/**
 * The package a bare specifier resolves to, or `null` when it is not a bare
 * specifier at all.
 *
 * `zod/v4` resolves through `zod`; `@scope/name/sub` through `@scope/name`. A
 * relative, absolute or `node:`-prefixed specifier is not a package.
 */
export function packageRoot(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.startsWith("node:")) return null;
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) return segments.slice(0, 2).join("/");
  return segments[0];
}

const NODE_BUILTINS = new Set(builtinModules);

/**
 * Every specifier in `files` that a consumer of `manifest` could not resolve.
 *
 * `read` is injected so the spec can run this predicate over synthetic input
 * without writing a tree.
 */
export function unresolvableSpecifiers({ files, read, manifest }) {
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {})
  ]);

  const findings = [];
  let specifiersSeen = 0;

  for (const file of files) {
    for (const specifier of moduleSpecifiers(read(file))) {
      specifiersSeen += 1;
      const root = packageRoot(specifier);
      if (root === null) continue;
      if (NODE_BUILTINS.has(root)) continue;
      if (declared.has(root)) continue;
      findings.push({ file, specifier, root });
    }
  }

  return { findings, specifiersSeen };
}

/** Every file under `dir`, recursively, relative to `cwd`, POSIX-separated. */
function filesUnder(cwd, dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(path.relative(cwd, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(cwd, dir));
  return found;
}

/**
 * `files` entries that publish something this scan never reads.
 *
 * Returned rather than warned about: an entry outside `<outDir>` means the
 * walked set is no longer the shipped set, and a pass over the wrong population
 * is not a pass.
 */
export function filesEntriesOutside(manifest, outDir) {
  const entries = manifest.files ?? [];
  return entries.filter((entry) => {
    const rel = entry.replace(/^\.?\//, "");
    // A bare filename at the package root (README.md, LICENSE) carries no code a
    // consumer resolves through and npm includes several unconditionally.
    if (!rel.includes("/")) return false;
    return !rel.startsWith(`${outDir}/`);
  });
}

function main() {
  const outDir = process.argv[2];
  if (outDir === undefined) {
    console.error("assert-published-imports: usage: node assert-published-imports.mjs <outDir>");
    process.exit(2);
  }

  const cwd = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  const name = manifest.name ?? path.basename(cwd);
  const abs = path.join(cwd, outDir);

  if (!fs.existsSync(abs)) {
    console.error(
      `assert-published-imports: ${name} has no ${outDir}/ (${abs}).\n` +
        `  Nothing to check, which is not the same as nothing wrong. Run the build first.`
    );
    process.exit(1);
  }

  const straying = filesEntriesOutside(manifest, outDir);
  if (straying.length > 0) {
    console.error(
      `assert-published-imports: ${name} publishes ${straying.length} path(s) outside ${outDir}/:\n` +
        straying.map((entry) => `    ${entry}`).join("\n") +
        `\n  This check walks ${outDir}/ and would report clean over files it never opened.\n` +
        `  Either keep everything published under ${outDir}/, or widen this scan to cover\n` +
        `  the paths above before the next publish.`
    );
    process.exit(1);
  }

  const all = filesUnder(cwd, outDir);
  if (all.length === 0) {
    console.error(
      `assert-published-imports: ${name} built ${outDir}/ and it is EMPTY.\n` +
        `  Every assertion below is vacuously true over an empty set.`
    );
    process.exit(1);
  }

  const files = all.filter(isCode);
  if (files.length === 0) {
    console.error(
      `assert-published-imports: ${name} — ${all.length} file(s) in ${outDir}/ and not one of\n` +
        `  them has a code extension (${CODE_EXTENSIONS.join(" ")}).\n` +
        `  The scan read nothing, so its silence means nothing.`
    );
    process.exit(1);
  }

  const read = (file) => fs.readFileSync(path.join(cwd, file), "utf8");
  const { findings, specifiersSeen } = unresolvableSpecifiers({ files, read, manifest });

  if (specifiersSeen === 0) {
    console.error(
      `assert-published-imports: ${name} — read ${files.length} file(s) in ${outDir}/ and found\n` +
        `  ZERO module specifiers in any of them. A package whose own entry point imports\n` +
        `  nothing is possible; an extractor that stopped matching looks exactly the same, and\n` +
        `  it reports every future leak as clean. Check moduleSpecifiers() in\n` +
        `  scripts/assert-published-imports.mjs against one of the emitted files.`
    );
    process.exit(1);
  }

  if (findings.length > 0) {
    const roots = [...new Set(findings.map((f) => f.root))].sort();
    console.error(
      `assert-published-imports: ${name} publishes ${findings.length} import(s) of ` +
        `${roots.length} package(s)\n` +
        `  that a consumer installing ${name} cannot resolve — ${roots.join(", ")}:\n` +
        findings.map((f) => `    ${f.file}  ->  ${f.specifier}`).join("\n") +
        `\n\n  Nothing on the registry answers those specifiers. They are neither a Node builtin\n` +
        `  nor listed in this package's "dependencies"/"peerDependencies", so the published\n` +
        `  files above are broken for every consumer.\n` +
        `  Fix one of three ways: stop the source file reaching that package; exclude the file\n` +
        `  from the declaration build (packages/sdk/tsconfig.build.json "exclude"); or, if the\n` +
        `  dependency is genuinely required at runtime, declare it in "dependencies" and make\n` +
        `  sure it is itself published.`
    );
    process.exit(1);
  }

  console.log(
    `assert-published-imports: ${name} — ${files.length} published file(s) in ${outDir}/, ` +
      `${specifiersSeen} module specifier(s), all resolvable`
  );
}

// Only when run as a program. Imported by the spec, `main()` must not fire.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  main();
}
