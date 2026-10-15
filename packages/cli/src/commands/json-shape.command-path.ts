/**
 * THE COMMAND PATH A `.command()` REGISTRATION SITS AT, RESOLVED FROM SOURCE.
 *
 * `json-shape.scan.ts` and `json-shape.registrar-prefix.ts` both need to know
 * which command a registration builds, and neither can run the CLI to find out.
 * A `.command("get")` literal is not a path — many leaves share a name with a
 * sibling in the same file — so the RECEIVER of each call is resolved back
 * through local variables and wrapper calls until it bottoms out at the
 * registrar's own parameter, yielding a path relative to whatever that parameter
 * is at runtime.
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the DOCUMENT and the public surface; the bodies live in
 * `json-shape-command-path/`, one concern per file:
 *
 *   · `command-name.ts` the one `.command("<literal>")` reading, and the
 *                       `await`/parenthesis strip every part shares;
 *   · `initializer.ts`  which `const` an identifier refers to, searched
 *                       innermost-first so a shadowing parameter stops it;
 *   · `resolve.ts`      peeling a builder chain, and the walk itself.
 *
 * 🚨 NOTHING HERE RESOLVES A PATH FROM ITS OWN MODULE. Every function takes the
 * `ts.SourceFile` it reads, so this split moved no `import.meta.url` and no
 * scan root — unlike `json-shape.project.ts` and `envelope-narrowing.scan.ts`,
 * whose roots are module-relative and gained a `..` segment each. Keep it that
 * way: a resolver added here would silently answer about this folder.
 *
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. `initializerOf` became an export of its
 * own part so `resolve.ts` can read it, and is NOT re-exported here.
 */

export { commandName, unwrap } from "./json-shape-command-path/command-name";
export { resolveCommandPath, type ResolvedCommandPath } from "./json-shape-command-path/resolve";
