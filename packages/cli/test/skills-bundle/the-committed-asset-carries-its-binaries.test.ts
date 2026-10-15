/**
 * THE COMMITTED ASSET — not a fixture — carries decodable binaries.
 *
 * `binary-round-trip.test.ts` beside this file proves the CODE: it builds a skills
 * tree, runs it through the real bundler, serialiser, installer and compares by
 * sha256. That is the stronger proof of the mechanism and this spec does not
 * repeat it.
 *
 * What it cannot see is the 18 MB of committed JSON the published package actually
 * ships. That file is written by `pnpm run gen:skills` against a private
 * repository, by hand, on a machine holding a token — so it is the one artefact in
 * this package that no CI run reproduces and no other spec reads. A regeneration
 * that silently truncated a payload, or a hand-edit of a file whose first line
 * says not to edit it, would pass every other gate: `check-skills-lock.ts`
 * compares the two halves' recorded shas and never looks at a file record.
 *
 * So this reads the artefact.
 *
 * ## What it deliberately does not assert
 *
 * **No floor on how many binaries the bundle holds.** That is upstream's business:
 * a skills commit vendoring none is a legitimate state, and a floor here would red
 * on a routine upstream delete. The arms below are therefore VACUOUS on a bundle
 * with no binary records, and the non-vacuity that matters lives in
 * `binary-round-trip.test.ts`, over bytes that file builds itself. At the pin this
 * landed on there are 2; read `binaryRecords()` rather than trusting that number.
 *
 * **No sha256 against upstream.** The upstream file lives in a private repository,
 * so comparing against it needs a credential and a network call. That half was
 * measured by hand when the pin moved to `cde9e3dc30f3`: both tarballs decoded out
 * of the committed payload are sha256-identical to the files in the upstream
 * tarball at that commit. Pinning those digests here would red the moment upstream
 * re-vendors a version, which is routine and not a defect.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SkillFile } from "../../src/skills-content.generated";
import { bundledCorpus } from "../../src/skills-corpus/corpus";
import { skillFileBytes } from "../../src/skills-corpus/skill-file.decode";
import { bundleToInstallables } from "../../src/util/skills-install.installable";
import { openInstallLedger } from "../../src/util/skills-install.ledger";
import { writeSkillFiles } from "../../src/util/skills-install.write-skill-files";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Every file record in the committed asset, across all four collected surfaces. */
function allRecords(): SkillFile[] {
  const corpus = bundledCorpus();
  return [
    ...corpus.skillList.flatMap((slug) => corpus.skills[slug].files),
    ...corpus.sharedFiles,
    ...corpus.hookFiles,
    ...corpus.agentFiles
  ];
}

/** The committed asset's base64 records, with the slug each belongs to. */
function binaryRecords(): { slug: string; file: SkillFile }[] {
  const corpus = bundledCorpus();
  const found: { slug: string; file: SkillFile }[] = [];
  for (const slug of corpus.skillList) {
    for (const file of corpus.skills[slug].files) {
      if (file.encoding === "base64") found.push({ slug, file });
    }
  }
  return found;
}

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "committed-asset-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("the committed skills asset", () => {
  it("is populated, so every arm below is reading something", () => {
    // The control for the file. An asset that arrived empty — a bad tarball, an
    // import resolving to a stub, a half-written regeneration — satisfies "every
    // record carries a marker this CLI reads" perfectly.
    const corpus = bundledCorpus();
    expect(corpus.skillList.length).toBeGreaterThan(0);
    expect(allRecords().length).toBeGreaterThan(0);
  });

  it("carries no encoding marker this CLI cannot read", () => {
    // `encoding` is OPTIONAL and absent means UTF-8, so the defect to catch is a
    // marker from a NEWER generator — which `skillFileBytes` refuses at install
    // time, one file into the write. Catching it here costs nothing and names
    // every offender at once instead of the first one.
    const unreadable = allRecords().filter(
      (f) => f.encoding !== undefined && f.encoding !== "base64"
    );
    expect(unreadable.map((f) => `${f.path}: ${String(f.encoding)}`)).toEqual([]);
  });

  it("decodes every base64 record — none is truncated or altered", () => {
    for (const { file } of binaryRecords()) {
      expect(() => skillFileBytes(file), file.path).not.toThrow();
    }
  });

  it("installs every base64 record to disk with the bytes it decodes to", () => {
    const records = binaryRecords();
    const corpus = bundledCorpus();
    const ledger = openInstallLedger(path.join(tmp, "ledger"));

    for (const installable of bundleToInstallables(corpus, [
      ...new Set(records.map((r) => r.slug))
    ])) {
      writeSkillFiles(path.join(tmp, "target", installable.slug), installable.files, { ledger });
    }

    for (const { slug, file } of records) {
      const onDisk = fs.readFileSync(path.join(tmp, "target", slug, file.path));
      // The reference is decoded HERE, not by `skillFileBytes`. The installer
      // reads its bytes through that function, so comparing against it would
      // compare the installer with itself: an arm that is satisfied whatever the
      // decoder returns, including the base64 TEXT of the file.
      expect(sha256(onDisk), `${slug}/${file.path}`).toBe(
        sha256(Buffer.from(file.content, "base64"))
      );
    }
  });

  it("holds bytes no UTF-8 round trip survives — so the base64 path is load-bearing", () => {
    // Without this, the arm above would be satisfied by a bundle whose "binary"
    // records were ordinary text, where reading the content as UTF-8 would have
    // produced the same file and the marker would be decoration.
    for (const { file } of binaryRecords()) {
      const bytes = skillFileBytes(file);
      expect(Buffer.from(bytes.toString("utf-8"), "utf-8").equals(bytes), file.path).toBe(false);
    }
  });
});
