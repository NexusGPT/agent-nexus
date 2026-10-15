import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { buildCorpusFromFiles } from "./build-corpus";
import type { SkillsCorpus } from "./corpus";
import { PlatformCorpusError } from "./platform-corpus-error";
import { skillFileBytes } from "./skill-file.decode";
import { type CliSkillsManifestWire, parseCorpus } from "./wire";

/**
 * TURNING THE BYTES THE PLATFORM SERVED INTO THE CORPUS AN INSTALL WRITES.
 *
 * This is the half of a corpus read that has nothing to do with HTTP. `platform.ts`
 * owns the transport — the URL, the timeout, the status, the socket — and hands the
 * bytes here; everything below is a pure function of those bytes and the manifest that
 * vouched for them, so it needs no `PlatformIo`, no network and no fake `fetch` to
 * exercise.
 *
 * The seam is where `fetchCorpus` stopped touching its `io` argument, not a line count.
 * It carries every reason a corpus can be unusable once it has arrived — a checksum
 * that does not match, a document this CLI cannot read, an unsafe path, a payload that
 * does not decode — and each one is a {@link PlatformCorpusError} so the caller falls
 * back to its bundled corpus rather than failing the install.
 */

/** A path the installer can write under its target: relative, forward slashes, no `.`, `..` or empty segment. */
function isInstallablePath(path: string): boolean {
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * The corpus a manifest names, out of the exact bytes served for it.
 *
 * The checksum is checked FIRST and before anything is unpacked, because the corpus
 * carries hooks — code that runs on this machine — so a payload that is not the one the
 * manifest vouched for must never reach a parser, let alone a disk.
 */
export function corpusFromServedBytes(gzip: Buffer, manifest: CliSkillsManifestWire): SkillsCorpus {
  const what = `skills commit ${manifest.commitSha}`;

  const digest = createHash("sha256").update(gzip).digest("hex");
  if (gzip.length !== manifest.size || digest !== manifest.sha256) {
    throw new PlatformCorpusError(
      "remote-error",
      `the corpus for ${what} does not match its checksum (got ${gzip.length} bytes, sha256 ${digest.slice(0, 12)})`
    );
  }

  let corpus: ReturnType<typeof parseCorpus>;
  try {
    corpus = parseCorpus(JSON.parse(gunzipSync(gzip).toString("utf-8")));
  } catch {
    corpus = null;
  }
  if (!corpus || corpus.commitSha !== manifest.commitSha) {
    throw new PlatformCorpusError(
      "remote-error",
      `the corpus for ${what} is not one this CLI reads`
    );
  }
  const unsafe = corpus.files.find((file) => !isInstallablePath(file.path));
  if (unsafe) {
    throw new PlatformCorpusError(
      "remote-error",
      `the corpus for ${what} names an unsafe path: ${unsafe.path}`
    );
  }

  // Decode EVERY record before building anything. `skillFileBytes` is the one place a
  // stored record becomes bytes — UTF-8 by default, base64 where the record says so —
  // shared with the bundled asset so the two sources cannot disagree about a file. It
  // throws on a base64 payload that does not re-encode to itself, which is a corpus
  // that would otherwise write plausible, wrong bytes; converting that into a
  // PlatformCorpusError is what makes it a fall-back-to-bundled rather than a crash,
  // like every other way this corpus can turn out to be unusable.
  let contents: Map<string, Buffer>;
  try {
    contents = new Map(corpus.files.map((file) => [file.path, skillFileBytes(file)]));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PlatformCorpusError(
      "remote-error",
      `the corpus for ${what} does not decode (${detail})`
    );
  }
  return buildCorpusFromFiles(manifest.commitSha, {
    paths: [...contents.keys()],
    read: (path) => contents.get(path) ?? Buffer.alloc(0)
  });
}
