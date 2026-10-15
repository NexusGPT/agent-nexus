/**
 * A binary file survives the PLATFORM channel byte for byte: a corpus document shaped
 * the way the publish route writes it, gzipped, served over a fake `fetch`, pulled
 * through the real `fetchCorpus` — checksum gate, `parseCorpus`, decoder and selection
 * — turned into installables and written to disk by the installer, then compared by
 * sha256 against the source bytes.
 *
 * `binary-round-trip.test.ts` beside this file proves the same property for the corpus
 * BUNDLED into the published package. The two channels meet at `buildCorpusFromFiles`
 * and diverge before it: the bundler reads bytes off disk, where this reads them out of
 * a JSON document. That divergence is the half that was broken — the platform channel
 * refused a corpus holding any non-UTF-8 file, so the skills repository's vendored
 * `.tgz` tarballs stopped every deploy on this route while the bundled one kept moving.
 *
 * ## What is the real code here, and what is not
 *
 * Everything from the served gzip onwards is shipped code. The ONE step reproduced by
 * hand is the server's encoding decision — `bytes.toString("base64")` plus the marker —
 * because the builder that makes it is backend code this package cannot import.
 * `apps/backend/src/cli-skills/domain/build-cli-skills-corpus.spec.ts` pins that half
 * against the same property, so the two meet on a literal both sides assert.
 *
 * ## What it deliberately does not do
 *
 * **No fixture of the real `e2e-0.19.0.tgz`.** It is 1.1 MB, it lives in a private
 * repository, and committing it here would pin a vendored version that upstream
 * re-vendors routinely. The round trip is a property of the BYTES, so a real `gzip`
 * member of incompressible bytes exercises exactly the same path. The real tarball was
 * put through this path by hand once, at skills commit `cde9e3dc30f3`: source sha256
 * `c1081199d2a81fbf8669be6de3db29774e231d9bb00dc796ccbd8fc2b49a09b8`, 1,106,880 bytes,
 * installed sha256 identical.
 */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchCorpus, type PlatformIo } from "../../src/skills-corpus/platform";
import { PlatformCorpusError } from "../../src/skills-corpus/platform-corpus-error";
import { parseCorpus } from "../../src/skills-corpus/wire";
import {
  bundleToInstallables,
  hookInstallables,
  type InstallableSkill,
  sharedInstallable
} from "../../src/util/skills-install.installable";
import { openInstallLedger } from "../../src/util/skills-install.ledger";
import { writeSkillFiles } from "../../src/util/skills-install.write-skill-files";

const BASE = "https://api.test.example";
const SHA = "e".repeat(40);

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

interface WireFile {
  path: string;
  content: string;
  encoding?: string;
}

/** One file as the publish route stores it: text verbatim, anything else base64. */
function encodeAsServerWould(filePath: string, bytes: Buffer): WireFile {
  if (!bytes.includes(0) && Buffer.from(bytes.toString("utf-8"), "utf-8").equals(bytes)) {
    return { path: filePath, content: bytes.toString("utf-8") };
  }
  return { path: filePath, content: bytes.toString("base64"), encoding: "base64" };
}

/**
 * A fake platform serving one corpus. `mutate` lets an arm serve a document the real
 * route would never write, which is how the refusal paths are exercised.
 */
function serving(files: WireFile[], mutate?: (doc: Record<string, unknown>) => void) {
  const doc: Record<string, unknown> = {
    schemaVersion: 2,
    commitSha: SHA,
    minCliVersion: null,
    files
  };
  mutate?.(doc);
  const gzip = gzipSync(Buffer.from(JSON.stringify(doc), "utf-8"));
  const manifest = {
    schemaVersion: 1 as const,
    commitSha: SHA,
    sha256: sha256(gzip),
    size: gzip.length,
    minCliVersion: null,
    publishedAt: "2026-10-15T00:00:00.000Z"
  };
  const io: PlatformIo = {
    baseUrl: BASE,
    cliVersion: "1.11.0",
    fetch: async () => new Response(gzip, { status: 200 }),
    globals: {}
  };
  return { io, manifest };
}

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "platform-binary-round-trip-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function install(base: string, installable: InstallableSkill): void {
  const ledger = openInstallLedger(path.join(tmp, "ledger"));
  writeSkillFiles(path.join(base, installable.slug), installable.files, { ledger });
}

/** A real gzipped tarball with incompressible bytes, the shape upstream vendors. */
const tarball = gzipSync(randomBytes(4096));
/** Ends in a space and a newline: anything trimmed would lose both. */
const hookBlob = Buffer.concat([randomBytes(200), Buffer.from([0x20, 0x0a])]);

const VENDOR = "skills/nexus-app-builder/references/e2e-kit/vendor";
const SKILL_MD = "---\nname: nexus-app-builder\n---\n# App builder\n\nBuilds apps.\n";

const corpusFiles = (): WireFile[] => [
  encodeAsServerWould("skills/nexus-app-builder/SKILL.md", Buffer.from(SKILL_MD, "utf-8")),
  encodeAsServerWould(`${VENDOR}/e2e-0.19.0.tgz`, tarball),
  encodeAsServerWould(`${VENDOR}/VENDOR.md`, Buffer.from("# Vendored\n", "utf-8")),
  encodeAsServerWould("skills/shared/client.ts", Buffer.from("export {};\n", "utf-8")),
  encodeAsServerWould("hooks/lib/blob.bin", hookBlob),
  encodeAsServerWould("CLAUDE.md", Buffer.from("root\n", "utf-8"))
];

/** Pull the corpus through the real wire path and install every tree it carries. */
async function installServedCorpus(
  files: WireFile[],
  mutate?: (doc: Record<string, unknown>) => void
): Promise<string> {
  const { io, manifest } = serving(files, mutate);
  const corpus = await fetchCorpus(io, manifest);
  const target = path.join(tmp, "target");
  for (const installable of bundleToInstallables(corpus, corpus.skillList)) {
    install(target, installable);
  }
  install(target, sharedInstallable(corpus));
  install(target, hookInstallables(corpus));
  return target;
}

describe("the platform corpus carries binaries byte for byte", () => {
  it("stores the tarball as base64 — so the arms below exercise that path", () => {
    // CONTROL on the fixture. Without it every arm here would be satisfied by a corpus
    // whose "binary" was ordinary text, where reading the content as UTF-8 would have
    // produced the same file and the marker would be decoration.
    const stored = corpusFiles().find((f) => f.path === `${VENDOR}/e2e-0.19.0.tgz`);
    expect(stored?.encoding).toBe("base64");
  });

  it("installs the vendored tarball with its source's sha256", async () => {
    const target = await installServedCorpus(corpusFiles());
    const onDisk = fs.readFileSync(
      path.join(target, "nexus-app-builder/references/e2e-kit/vendor/e2e-0.19.0.tgz")
    );
    expect(sha256(onDisk)).toBe(sha256(tarball));
  });

  it("installs a binary hook with its source's sha256, trailing whitespace intact", async () => {
    const target = await installServedCorpus(corpusFiles());
    expect(sha256(fs.readFileSync(path.join(target, "hooks/lib/blob.bin")))).toBe(sha256(hookBlob));
  });

  it("still installs text trimmed, exactly as this channel always did", async () => {
    const target = await installServedCorpus(corpusFiles());
    const onDisk = fs.readFileSync(path.join(target, "nexus-app-builder/SKILL.md"));
    expect(onDisk.toString("utf-8")).toBe(SKILL_MD.trim());
  });

  it("writes a tarball no UTF-8 round trip could have produced", async () => {
    // Without this, the sha256 arm above could be satisfied by a channel that happened
    // to carry these bytes as text. It cannot: these bytes do not survive that.
    const target = await installServedCorpus(corpusFiles());
    const onDisk = fs.readFileSync(
      path.join(target, "nexus-app-builder/references/e2e-kit/vendor/e2e-0.19.0.tgz")
    );
    expect(Buffer.from(onDisk.toString("utf-8"), "utf-8").equals(onDisk)).toBe(false);
  });
});

describe("a schemaVersion 1 corpus — every commit published before this change", () => {
  // The platform never rewrites a corpus it has stored, so every historical commit stays
  // version 1 for ever. Refusing them would break `--skills-ref` against all of them and
  // would make every `latest` install fall back to the bundled copy until the skills
  // repository next deploys. Version 1 means "all text", which is what version 2 means
  // for a file with no marker — so it is read, not refused.
  const v1 = (): WireFile[] => [
    { path: "skills/nexus-app-builder/SKILL.md", content: SKILL_MD },
    { path: "CLAUDE.md", content: "root\n" }
  ];

  it("installs, rather than falling back to the bundled corpus", async () => {
    const target = await installServedCorpus(v1(), (doc) => {
      doc.schemaVersion = 1;
    });
    expect(fs.existsSync(path.join(target, "nexus-app-builder/SKILL.md"))).toBe(true);
  });

  it("installs its text with the same content a version 2 corpus would", async () => {
    const target = await installServedCorpus(v1(), (doc) => {
      doc.schemaVersion = 1;
    });
    const onDisk = fs.readFileSync(path.join(target, "nexus-app-builder/SKILL.md"));
    expect(onDisk.toString("utf-8")).toBe(SKILL_MD.trim());
  });
});

describe("parseCorpus — the parser's own guarantee about `encoding`", () => {
  // `fetchCorpus` refuses an unknown marker TWICE over: the parser rejects the document,
  // and `skillFileBytes` would throw on it anyway. So the outcome arms below cannot say
  // WHICH layer refused, and deleting the parser's check leaves them green. These two
  // pin the parser directly, because its declared return type says `encoding` is
  // `"base64" | undefined` — a parser that passed any other string through would be
  // lying about what it returns, whatever the installer later does about it.
  const doc = (encoding: string) => ({
    schemaVersion: 2,
    commitSha: SHA,
    minCliVersion: null,
    files: [{ path: "CLAUDE.md", content: "cm9vdAo=", encoding }]
  });

  it("returns null for a marker it does not know", () => {
    expect(parseCorpus(doc("brotli"))).toBeNull();
  });

  it("accepts the marker it does know — so the arm above is not refusing everything", () => {
    // CONTROL. Without it, a parser that rejected every document would satisfy the arm
    // above perfectly.
    expect(parseCorpus(doc("base64"))?.files[0].encoding).toBe("base64");
  });
});

describe("a corpus this CLI must not install", () => {
  const refusal = async (mutate: (doc: Record<string, unknown>) => void): Promise<unknown> => {
    const { io, manifest } = serving(corpusFiles(), mutate);
    return fetchCorpus(io, manifest).catch((error: unknown) => error);
  };

  it("refuses an encoding marker it does not know, rather than writing the text", async () => {
    // The forward-compatibility case: a newer platform invents a third encoding. Writing
    // the content as text would put a corrupt file on disk with nothing to notice it.
    const error = await refusal((doc) => {
      doc.files = [{ path: "CLAUDE.md", content: "cm9vdAo=", encoding: "brotli" }];
    });
    expect(error).toBeInstanceOf(PlatformCorpusError);
  });

  it("refuses a schemaVersion NEWER than it understands", async () => {
    // The forward guard, and the mirror of what a published CLI does with version 2: a
    // reader handed a document from a newer platform refuses it, and the caller falls
    // back to its bundled corpus rather than writing something it cannot interpret.
    const error = await refusal((doc) => {
      doc.schemaVersion = 3;
    });
    expect(error).toBeInstanceOf(PlatformCorpusError);
  });

  it("refuses base64 that does not re-encode to itself, rather than writing wrong bytes", async () => {
    // `Buffer.from(s, "base64")` SKIPS characters it does not recognise instead of
    // failing, so a damaged payload decodes to plausible, wrong bytes. The canonical
    // check is what turns that into a refusal.
    const error = await refusal((doc) => {
      doc.files = [{ path: "x.bin", content: "!!!!not base64!!!!", encoding: "base64" }];
    });
    expect(error).toBeInstanceOf(PlatformCorpusError);
  });
});
