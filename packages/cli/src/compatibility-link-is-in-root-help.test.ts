import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { captureHelp } from "./command-universe";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * `nexus --help` LEADS A READER TO THE STABILITY CONTRACT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `COMPATIBILITY.md` is the promise this package asks people to hold it to —
 * four tiers, what each guarantees, what counts as a breaking change for each.
 * The binary never named it.
 *
 * 🚨 `git grep COMPATIBILITY -- packages/cli/src` IS NOT EMPTY, and reading it
 * as empty is the easy mistake here. It returns 30 lines across 9 files — and
 * every one is a comment, a test description, a test assertion message, a
 * test's own path constant, or a ledger `note` that only a test reads. Not one
 * is a string this program prints. So no command, no help screen and no error
 * ever led a user to the document, while a grep for its name looked busy.
 *
 * The only pointers were two links inside `README.md`, which is a file you
 * reach only if you already went looking for the repository.
 *
 * A contract nobody can find FROM THE TOOL is indistinguishable from no
 * contract. Worse than absent, in the same way an unenforced documented promise
 * is worse than an undocumented one: the tiers exist, so a maintainer believes
 * scripting expectations are set, while the person writing the script has never
 * been shown them.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE LINK IS AN ABSOLUTE URL AND NOT `packages/cli/COMPATIBILITY.md`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 A REPO-RELATIVE PATH NAMES A FILE THAT IS ON NO INSTALLED COPY.
 * `package.json` declares `files: ["dist"]`, so the published tarball is the
 * compiled binary and nothing else — the document is absent from every
 * `npm install -g @agent-nexus/cli`, and the repository it really lives in is
 * private. The mirror named by `repository.url` is public and is the one place
 * a reader outside this machine can open it, so the epilogue spells the URL.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS ASSERTS, AND WHAT IT CANNOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The help is CAPTURED from the real root program through {@link captureHelp},
 * not read out of `index.ts` as text. Commander's `helpInformation()` drops
 * every `addHelpText` block, and the epilogue IS one — a spec built on it would
 * pass over a link that never renders. Reading the source file instead would
 * assert the string is typed, never that a terminal receives it.
 *
 * Four things fail here, and each is a way this link has to rot:
 *
 *   · THE LINK IS GONE. Someone trims the epilogue and the contract is
 *     unreachable from the tool again.
 *   · THE MIRROR MOVED. The URL is pinned to `repository.url` and
 *     `repository.directory`, so renaming the published repo fails rather than
 *     leaving a 404 on the busiest help screen in the package.
 *   · THE DOCUMENT WAS RENAMED OR DELETED. The basename the URL names must
 *     resolve to a real file in this package.
 *   · THE TIER NAMES DRIFTED. The epilogue names the four tiers so a reader
 *     knows what the link answers; they are checked against the tier table in
 *     `COMPATIBILITY.md`, both directions, so renaming a tier in one place
 *     fails instead of leaving two vocabularies.
 *
 * It CANNOT tell you the URL resolves — that is a network call and this suite
 * makes none. `main` is the branch the mirror publishes from and the branch
 * `package.json`'s own `homepage` already points at; if that ever changes, this
 * spec is green and the link is dead. It also says nothing about the prose
 * around the link being true — {@link compatibility-figures.test.ts} owns every
 * FIGURE the document asserts, and nothing owns its sentences.
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(SRC_DIR, "..");

interface PackageManifest {
  readonly repository: { readonly url: string; readonly directory: string };
}

const manifest = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")
) as PackageManifest;

/** `nexus --help` exactly as a terminal receives it, epilogue included. */
const rootHelp = captureHelp(buildRootProgram(VERSION));

/** Every absolute link to a `.md` document the root help prints. */
const markdownLinks = [...rootHelp.matchAll(/https:\/\/\S+?\.md\b/g)].map((match) => match[0]);

/** `git+https://github.com/NexusGPT/agent-nexus.git` → `https://github.com/NexusGPT/agent-nexus`. */
const repositoryUrl = manifest.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

describe("the root help points at the compatibility contract", () => {
  it("captured a real help screen with a real epilogue", () => {
    // Anti-vacuity. An empty capture, or one that stopped at the options table,
    // makes every assertion below pass by matching nothing — and a capture that
    // dropped the `addHelpText` blocks reads exactly like a complete one.
    expect(rootHelp.length).toBeGreaterThan(4000);
    expect(rootHelp).toContain("SENDING A BODY");
    expect(rootHelp).toContain("WHICH PROFILE A COMMAND USES");
  });

  it("names COMPATIBILITY.md, so the contract is reachable from the tool", () => {
    // The defect itself: the binary said nothing about its own stability
    // contract, on any screen.
    const links = markdownLinks.filter((link) => link.endsWith("/COMPATIBILITY.md"));
    expect(links).toHaveLength(1);
  });

  it("links the repository package.json publishes from", () => {
    // A URL typed once and never checked is a 404 waiting for the mirror to be
    // renamed. Pinning it to the manifest makes that a failure here instead.
    const [link] = markdownLinks.filter((l) => l.endsWith("/COMPATIBILITY.md"));
    expect(link).toBe(
      `${repositoryUrl}/blob/main/${manifest.repository.directory}/COMPATIBILITY.md`
    );
  });

  it("names a document that exists in this package", () => {
    // The link is only as good as the file at the other end. A rename in this
    // package leaves the URL pointing at a path the mirror no longer carries.
    const [link] = markdownLinks.filter((l) => l.endsWith("/COMPATIBILITY.md"));
    const basename = (link ?? "").split("/").pop() ?? "";
    expect(basename).not.toBe("");
    expect(existsSync(join(PACKAGE_ROOT, basename))).toBe(true);
  });

  describe("the tiers the epilogue names are the tiers the document declares", () => {
    // Derived from the table under `## The four tiers`, never typed out here: a
    // hand-copied list goes stale the moment a tier is renamed, which is the
    // rot this whole file exists to refuse one level up.
    const doc = readFileSync(join(PACKAGE_ROOT, "COMPATIBILITY.md"), "utf8");
    const tierTable = doc.slice(doc.indexOf("## The four tiers"), doc.indexOf("## STABLE"));
    const tiers = [...tierTable.matchAll(/^\|\s*\*\*([A-Z]+)\*\*/gm)].map((match) => match[1]);

    it("read a real tier table", () => {
      expect(tiers).toHaveLength(4);
    });

    it.each(eachOrRefuse(tiers, "the tiers COMPATIBILITY.md declares"))(
      "the epilogue names %s",
      (tier) => {
        expect(rootHelp).toContain(tier);
      }
    );

    it("names no tier the document does not declare", () => {
      // The other direction. A tier deleted from the contract but left on the
      // help screen reads exactly like one still promised.
      const block = rootHelp.slice(
        rootHelp.indexOf("WHAT YOU MAY SCRIPT AGAINST"),
        rootHelp.indexOf("Tip: Run")
      );
      const named = [...block.matchAll(/\b([A-Z]{6,})\b/g)].map((match) => match[1] as string);
      const declared = new Set(tiers);
      // Only words that ARE tiers anywhere in the contract are judged; the
      // block legitimately shouts other things, and policing those is not this
      // spec's job.
      const known = new Set([...doc.matchAll(/\*\*([A-Z]+)\*\*/g)].map((match) => match[1]));
      expect(named.filter((word) => known.has(word) && !declared.has(word))).toEqual([]);
    });
  });
});
