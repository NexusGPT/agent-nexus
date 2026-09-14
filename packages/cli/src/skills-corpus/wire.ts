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
}

export interface CliSkillsCorpusWire {
  schemaVersion: 1;
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
  if (
    schemaVersion !== 1 ||
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
    parsedFiles.push({ path: file.path, content: file.content });
  }
  return { schemaVersion, commitSha, minCliVersion, files: parsedFiles };
}
