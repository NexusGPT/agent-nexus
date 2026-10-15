/**
 * A binary file survives the whole bundle path byte for byte: an extracted skills
 * tree, read the way `bundle-skills.ts` reads it, built into a corpus, serialised
 * into the JSON asset and parsed back, turned into installables and written to
 * disk by the installer — then compared by sha256 against the source.
 *
 * Why it exists: upstream vendors `.tgz` tarballs inside a skill, and the bundle
 * used to store every file as a string. Written back as UTF-8, a tarball reaches
 * disk with replacement characters and nothing compares the bytes afterwards, so
 * the only honest proof is the comparison this spec makes.
 *
 * Every stage below is the shipped code, except the eight-field mapping from the
 * parsed asset to a corpus, which is what the generated module's getters do and
 * which this spec cannot reach without the asset sitting beside that module.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type BundlePayload, toBundlePayload } from "../../scripts/skills-bundle/bundle-payload";
import { corpusDirectory } from "../../scripts/skills-bundle/corpus-directory";
import { buildCorpusFromFiles } from "../../src/skills-corpus/build-corpus";
import type { SkillsCorpus } from "../../src/skills-corpus/corpus";
import {
  bundleToInstallables,
  hookInstallables,
  type InstallableSkill,
  sharedInstallable
} from "../../src/util/skills-install.installable";
import { openInstallLedger } from "../../src/util/skills-install.ledger";
import { writeSkillFiles } from "../../src/util/skills-install.write-skill-files";

const SHA = "d".repeat(40);

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-binary-round-trip-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(root: string, rel: string, bytes: Buffer | string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
}

/** A real gzipped tarball, made by `tar` itself, the shape upstream vendors. */
function realTarball(): Buffer {
  const src = path.join(tmp, "tarball-src");
  write(src, "package/package.json", '{ "name": "e2e", "version": "0.19.0" }\n');
  write(src, "package/bin/run.js", "#!/usr/bin/env node\nconsole.log('ok')\n");
  // Incompressible bytes, so the archive holds every byte value rather than a
  // run gzip collapses — the tarball is binary throughout, not only in its header.
  write(src, "package/blob.bin", randomBytes(4096));
  const out = path.join(tmp, "e2e-0.19.0.tgz");
  execFileSync("tar", ["-czf", out, "-C", src, "package"]);
  return fs.readFileSync(out);
}

/** Through the JSON asset and back, exactly as the generator writes it and the module reads it. */
function throughTheAsset(corpus: SkillsCorpus): SkillsCorpus {
  const assetPath = path.join(tmp, "skills-content.generated.json");
  fs.writeFileSync(assetPath, JSON.stringify(toBundlePayload(corpus)), "utf-8");
  const parsed = JSON.parse(fs.readFileSync(assetPath, "utf-8")) as BundlePayload;
  return {
    commitSha: parsed.sha,
    skills: parsed.SKILLS,
    skillList: parsed.SKILL_LIST,
    claudeMd: parsed.CLAUDE_MD,
    sharedFiles: parsed.SHARED_FILES,
    settingsJson: parsed.SETTINGS_JSON,
    hookFiles: parsed.HOOK_FILES,
    agentFiles: parsed.AGENT_FILES
  };
}

function install(base: string, installable: InstallableSkill): void {
  const ledger = openInstallLedger(path.join(tmp, "ledger"));
  writeSkillFiles(path.join(base, installable.slug), installable.files, { ledger });
}

describe("a binary file round-trips through the bundle byte for byte", () => {
  it("installs vendored tarballs and binary hooks with their source's sha256, and text as before", () => {
    const repo = path.join(tmp, "repo");
    const tarball = realTarball();
    const smallTarball = gzipSync(randomBytes(512));
    const hookBlob = Buffer.concat([randomBytes(200), Buffer.from([0x20, 0x0a])]);
    const skillMd = "---\nname: nexus-app-builder\n---\n# App builder\n\nBuilds apps.\n";
    const vendorMd = "# Vendored\n\nTwo tarballs.\n";

    write(repo, "skills/nexus-app-builder/SKILL.md", skillMd);
    write(repo, "skills/nexus-app-builder/references/e2e-kit/vendor/VENDOR.md", vendorMd);
    write(repo, "skills/nexus-app-builder/references/e2e-kit/vendor/e2e-0.19.0.tgz", tarball);
    write(
      repo,
      "skills/nexus-app-builder/references/e2e-kit/vendor/e2e-dev-acp-0.0.0.tgz",
      smallTarball
    );
    write(repo, "skills/shared/client.ts", "export {};\n");
    write(repo, "hooks/lib/blob.bin", hookBlob);
    write(repo, "hooks/guard.py", "#!/usr/bin/env python3\npass\n");

    // CONTROL on the fixture: each binary really is not UTF-8, so the arm below is
    // exercising the base64 path and not passing through the text one.
    for (const bytes of [tarball, smallTarball, hookBlob]) {
      expect(Buffer.from(bytes.toString("utf-8"), "utf-8").equals(bytes)).toBe(false);
    }

    const loaded = throughTheAsset(buildCorpusFromFiles(SHA, corpusDirectory(repo)));
    const target = path.join(tmp, "target");
    for (const installable of bundleToInstallables(loaded, loaded.skillList)) {
      install(target, installable);
    }
    install(target, sharedInstallable(loaded));
    install(target, hookInstallables(loaded));

    const installed = (rel: string): Buffer => fs.readFileSync(path.join(target, rel));
    const vendor = "nexus-app-builder/references/e2e-kit/vendor";
    expect(sha256(installed(`${vendor}/e2e-0.19.0.tgz`))).toBe(sha256(tarball));
    expect(sha256(installed(`${vendor}/e2e-dev-acp-0.0.0.tgz`))).toBe(sha256(smallTarball));
    // Ends in a space and a newline: a binary that was trimmed would lose both.
    expect(sha256(installed("hooks/lib/blob.bin"))).toBe(sha256(hookBlob));

    // Text is stored and installed exactly as it always was — trimmed.
    expect(installed(`${vendor}/VENDOR.md`).toString("utf-8")).toBe(vendorMd.trim());
    expect(installed("nexus-app-builder/SKILL.md").toString("utf-8")).toBe(skillMd.trim());
    expect(installed("shared/client.ts").toString("utf-8")).toBe("export {};");
    expect(installed("hooks/guard.py").toString("utf-8")).toBe("#!/usr/bin/env python3\npass");
  });
});

describe("the installer decodes by the marker and refuses one it does not know", () => {
  /** A corpus whose one skill file is the given JSON, as a parsed asset would hold it. */
  function corpusWithFile(fileJson: string): SkillsCorpus {
    const files = JSON.parse(`[${fileJson}]`) as SkillsCorpus["sharedFiles"];
    return {
      commitSha: SHA,
      skills: { "nexus-a": { slug: "nexus-a", description: "", files: [...files] } },
      skillList: ["nexus-a"],
      claudeMd: "",
      sharedFiles: [],
      settingsJson: "",
      hookFiles: [],
      agentFiles: []
    };
  }

  it("refuses an unknown encoding, naming the file and the marker", () => {
    const corpus = corpusWithFile('{ "path": "kit.tgz", "content": "H4sI", "encoding": "gzip" }');
    expect(() => bundleToInstallables(corpus, ["nexus-a"])).toThrow(
      'Refusing to install "kit.tgz": it is stored with encoding "gzip"'
    );
  });

  it("refuses base64 that does not decode cleanly", () => {
    const corpus = corpusWithFile(
      '{ "path": "kit.tgz", "content": "H4s*I", "encoding": "base64" }'
    );
    expect(() => bundleToInstallables(corpus, ["nexus-a"])).toThrow(
      'Refusing to install "kit.tgz": its base64 content does not decode cleanly'
    );
  });

  it("CONTROL: a well-formed base64 file and an unmarked text file both decode", () => {
    const corpus = corpusWithFile(
      '{ "path": "kit.tgz", "content": "H4sIAA==", "encoding": "base64" }, ' +
        '{ "path": "SKILL.md", "content": "# A" }'
    );
    const [skill] = bundleToInstallables(corpus, ["nexus-a"]);
    expect(skill.files.map((f) => [f.path, f.content.toString("hex")])).toEqual([
      ["kit.tgz", "1f8b0800"],
      ["SKILL.md", Buffer.from("# A").toString("hex")]
    ]);
  });
});
