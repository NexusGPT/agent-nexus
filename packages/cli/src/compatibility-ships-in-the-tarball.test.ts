import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { captureHelp } from "./command-universe";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * THE STABILITY CONTRACT SHIPS INSIDE THE PACKAGE, NOT ONLY AT A URL.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT A URL CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root help names `COMPATIBILITY.md` by absolute URL, on the public mirror,
 * on branch `main`. {@link compatibility-link-is-in-root-help.test.ts} holds that
 * link honest. Two things it cannot fix, because they are properties of a URL and
 * not of that spec:
 *
 *   · A BRANCH URL ANSWERS FOR THE NEWEST PROMISE, NEVER THE INSTALLED ONE.
 *     A reader on `@agent-nexus/cli` 0.31 who follows the link is shown the
 *     contract as it stands on `main` — tiers that may have moved since the
 *     binary in their PATH was built. The document they need is the one that
 *     shipped WITH their copy, and no branch URL can ever be that document.
 *   · A URL NEEDS A NETWORK, AND A CONTRACT IS READ EXACTLY WHEN SOMEONE IS
 *     DEBUGGING A SCRIPT. Air-gapped CI, a locked-down build box, a plane: the
 *     promise is unreadable in precisely the situations that produce the
 *     question.
 *
 * So the document is shipped in the tarball as well. `package.json` names it in
 * `files`, beside `dist`, and it is then on disk in every install — readable at
 * the version the reader actually has.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS ASKS NPM INSTEAD OF READING `files`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 `files` NAMES A PATH. THE TARBALL CARRIES A FILE, AND THE TWO COME APART.
 * An entry in `files` is a request, not a guarantee: rename the document, delete
 * it, or write a glob that matches nothing, and npm publishes what it finds
 * while the array goes on reading `["dist", "COMPATIBILITY.md"]`. Measured on
 * npm 11.6.0 — move `COMPATIBILITY.md` aside with the array untouched and the
 * pack manifest drops from five entries to four. A spec reading the array is
 * green through every one of those; this one is red.
 *
 * `npm pack --dry-run --json` is npm's own answer to "what would be published",
 * computed by the same code that builds the real tarball. It writes nothing:
 * `--dry-run` produces the manifest and no `.tgz`.
 *
 * ⚠️ Do NOT extend that reasoning to `.npmignore` on the strength of how npm is
 * documented. Measured on npm 11.6.0: an `.npmignore` naming `COMPATIBILITY.md`,
 * with the `files` entry left in place, changed the pack manifest not at all —
 * the explicit allowlist won. The claim was written here as fact first and the
 * negative control refused it, which is the only reason this paragraph is not a
 * confident falsehood sitting next to a passing spec.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ANTI-VACUITY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A pack manifest can be wrong in two directions, and only one of them is loud.
 * If the subprocess fails, `execFileSync` throws and the spec is red. The quiet
 * direction is a manifest that lists EVERYTHING — a broken `files` array makes
 * npm fall back to the whole directory, and `COMPATIBILITY.md` is then present
 * for a reason that has nothing to do with it being declared. So this file also
 * asserts that sources npm must NOT carry are absent. Presence alone is not the
 * claim; presence out of a genuinely filtered list is.
 *
 * The pack list is checked against the help link too, so shipping a file the
 * epilogue does not name — or naming one the tarball does not carry — fails here
 * rather than in a user's terminal.
 *
 * It does NOT need `dist/` to exist. `dist/index.js` is the built binary and this
 * suite runs on an unbuilt checkout in CI, so asserting it would be a spec that
 * fails for a reason it does not care about.
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(SRC_DIR, "..");

/**
 * Files that live in this package and must never reach a user. Each one is
 * asserted to EXIST before it is asserted to be absent from the tarball, so a
 * control cannot go quietly vacuous by being deleted.
 */
const MUST_NOT_SHIP = ["tsconfig.json", "vitest.config.ts", "tsup.config.ts", "CHANGELOG.md"];

interface PackManifest {
  readonly name: string;
  readonly entryCount: number;
  readonly files: readonly { readonly path: string }[];
}

/**
 * Everything `npm publish` would put in the tarball, asked of npm rather than
 * inferred from `package.json`.
 */
function packedPaths(): { manifest: PackManifest; paths: string[] } {
  const stdout = execFileSync("npm", ["pack", "--dry-run", "--json", PACKAGE_ROOT], {
    encoding: "utf8",
    // stderr is npm's notices; only stdout carries the JSON. Inheriting stderr
    // would scatter npm chatter through the reporter for no gain.
    stdio: ["ignore", "pipe", "pipe"]
  });

  const parsed = JSON.parse(stdout) as PackManifest[];
  const [manifest] = parsed;
  if (manifest === undefined) {
    throw new Error(`npm pack --json returned no manifest. Raw output: ${stdout}`);
  }

  return { manifest, paths: manifest.files.map((file) => file.path) };
}

const { manifest, paths } = packedPaths();

/** The basename the root help's compatibility URL points at. */
const linkedDocument = (() => {
  const rootHelp = captureHelp(buildRootProgram(VERSION));
  const [link] = [...rootHelp.matchAll(/https:\/\/\S+?\.md\b/g)]
    .map((match) => match[0])
    .filter((candidate) => candidate.endsWith("/COMPATIBILITY.md"));
  return (link ?? "").split("/").pop() ?? "";
})();

describe("the published tarball carries the stability contract", () => {
  it("asked npm about this package and got a real manifest", () => {
    // Anti-vacuity. A manifest for the wrong package, or an empty file list,
    // makes every assertion below pass by matching nothing.
    expect(manifest.name).toBe("@agent-nexus/cli");
    expect(paths.length).toBeGreaterThan(0);
    expect(manifest.entryCount).toBe(paths.length);
    // npm carries these two whatever `files` says, so they prove the manifest
    // describes a package rather than an empty glob.
    expect(paths).toContain("package.json");
  });

  it.each(eachOrRefuse(MUST_NOT_SHIP, "the package files npm must not publish"))(
    "is a FILTERED list: %s exists here and is not published",
    (excluded) => {
      // The quiet failure this spec exists to refuse: a `files` array npm cannot
      // read makes it publish the whole directory, and the contract is then
      // present for a reason that would vanish the moment the array is repaired.
      //
      // The existence check is half the control. A file deleted from this package
      // is trivially absent from the tarball, so a control that only asserted
      // absence would keep passing while proving nothing — the exact rot this
      // suite exists to catch, one level down.
      expect(existsSync(join(PACKAGE_ROOT, excluded))).toBe(true);
      expect(paths).not.toContain(excluded);
    }
  );

  it("publishes no source and no spec", () => {
    expect(paths.filter((path) => path.startsWith("src/"))).toEqual([]);
    expect(paths.filter((path) => path.endsWith(".test.ts"))).toEqual([]);
  });

  it("ships COMPATIBILITY.md, so the promise is readable from an install", () => {
    // The defect: `files: ["dist"]` published the binary and no contract, so the
    // only copy of the promise a user could reach was a branch URL describing a
    // version they were not running.
    expect(paths).toContain("COMPATIBILITY.md");
  });

  it("ships the document the root help sends people to", () => {
    // The two halves have to name one file. A rename that updates the epilogue
    // and not `files` — or `files` and not the epilogue — leaves a live pointer
    // at a document nobody receives.
    expect(linkedDocument).toBe("COMPATIBILITY.md");
    expect(paths).toContain(linkedDocument);
  });
});
