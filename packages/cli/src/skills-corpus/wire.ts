/**
 * The wire shapes of the platform's CLI skills routes (`/api/cli/skills/*`).
 *
 * Hand-declared, because the CLI publishes standalone and cannot take
 * `@nexus/types` as a runtime dependency. The originals are
 * `packages/types/src/api/domains/cli-skills/zcli-skills.ts`, and
 * `wire.conformance.ts` beside this file fails the CLI typecheck when a copy here
 * stops matching one there.
 *
 * The parsers below are the runtime half: a manifest vouches for what gets
 * installed, so a response that does not have exactly the fields the CLI relies
 * on is refused rather than read with defaults.
 */

export interface CliSkillsManifestWire {
  schemaVersion: 1;
  commitSha: string;
  sha256: string;
  size: number;
  minCliVersion: string | null;
  publishedAt: string;
}

export interface CliSkillsCorpusFileWire {
  path: string;
  content: string;
  /**
   * ABSENT means UTF-8 text. `"base64"` means `content` IS the file's bytes.
   *
   * Structurally identical to `SkillFile`'s own marker, so `skillFileBytes` decodes a
   * record from either source — the bundled asset or the platform — and there is one
   * decoder rather than two that can disagree.
   */
  encoding?: "base64";
}

/**
 * The corpus document, in any version this CLI can read.
 *
 * The platform WRITES version 2, because a file may carry `encoding` and a reader that
 * knew only version 1 would drop that field and write the base64 TEXT to disk as though
 * it were the file. This CLI READS 1 as well: version 1 means "every file is text",
 * which is exactly what version 2 means for a file with no marker, so an older document
 * needs no special handling — only permission.
 *
 * That permission is load-bearing rather than generous. The platform never rewrites a
 * corpus it has already stored, so every historically published commit is version 1 for
 * ever: refusing them would break `--skills-ref` against all of them, and would make
 * every `latest` install fall back to the bundled copy until the skills repository's
 * next deploy republishes under version 2.
 *
 * The manifest's own version stays 1 — its shape has not changed.
 */
export interface CliSkillsCorpusWire {
  schemaVersion: 1 | 2;
  commitSha: string;
  minCliVersion: string | null;
  files: CliSkillsCorpusFileWire[];
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMinCliVersion = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && VERSION.test(value));

/** The manifest inside a `{ success, data }` envelope, or null when the body is not one. */
export function parseManifestEnvelope(body: unknown): CliSkillsManifestWire | null {
  const data = isRecord(body) && body.success === true ? body.data : undefined;
  if (!isRecord(data)) return null;
  const { schemaVersion, commitSha, sha256, size, minCliVersion, publishedAt } = data;
  if (
    schemaVersion !== 1 ||
    typeof commitSha !== "string" ||
    !COMMIT_SHA.test(commitSha) ||
    typeof sha256 !== "string" ||
    !SHA256.test(sha256) ||
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    !isMinCliVersion(minCliVersion) ||
    typeof publishedAt !== "string"
  ) {
    return null;
  }
  return { schemaVersion, commitSha, sha256, size, minCliVersion, publishedAt };
}

/** The corpus document, or null when it is not one. */
export function parseCorpus(body: unknown): CliSkillsCorpusWire | null {
  if (!isRecord(body)) return null;
  const { schemaVersion, commitSha, minCliVersion, files } = body;
  // Every version this CLI interprets correctly. A version NOT here — a newer platform
  // than this CLI — is refused, which is the whole point of the field.
  if (
    (schemaVersion !== 2 && schemaVersion !== 1) ||
    typeof commitSha !== "string" ||
    !COMMIT_SHA.test(commitSha) ||
    !isMinCliVersion(minCliVersion) ||
    !Array.isArray(files)
  ) {
    return null;
  }
  const parsedFiles: CliSkillsCorpusFileWire[] = [];
  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || typeof file.content !== "string") {
      return null;
    }
    // An encoding this CLI does not read means the corpus was written by a newer
    // platform. Refusing the WHOLE corpus here is deliberate: the caller falls back to
    // the corpus bundled with this CLI and says why, which is a complete install of a
    // known commit. Carrying the record through to the installer instead would throw
    // mid-plan and leave the user with no skills at all.
    if (file.encoding !== undefined && file.encoding !== "base64") return null;
    parsedFiles.push(
      file.encoding === undefined
        ? { path: file.path, content: file.content }
        : { path: file.path, content: file.content, encoding: file.encoding }
    );
  }
  return { schemaVersion, commitSha, minCliVersion, files: parsedFiles };
}
