import { compareVersions } from "../deprecation-cycle";
import { bundledCorpus, type SkillsCorpus } from "./corpus";
import { fetchCorpus, fetchManifest, PlatformCorpusError, type PlatformIo } from "./platform";

/**
 * Where an install's corpus came from:
 *
 *   - `platform` — the latest corpus the platform serves, the default;
 *   - `pinned`   — one commit, named with `--skills-ref`;
 *   - `bundled`  — the corpus compiled into this CLI, because `--bundled` asked for
 *                  it or because the platform's could not be used.
 */
export type CorpusSourceKind = "platform" | "pinned" | "bundled";

export interface ResolvedCorpus {
  readonly corpus: SkillsCorpus;
  readonly source: CorpusSourceKind;
  /**
   * Why the platform's corpus was NOT used although nobody asked for the bundle.
   * Null whenever the source is the one the caller asked for.
   */
  readonly fallbackReason: string | null;
  /** The oldest CLI the installed corpus declares it is written for, when known. */
  readonly minCliVersion: string | null;
  /** Things the user must be told, one sentence each. Printed to stderr. */
  readonly warnings: readonly string[];
}

export interface CorpusChoice {
  /** `--bundled`: never touch the network. */
  readonly bundled?: boolean;
  /** `--skills-ref <commit>`: install exactly this commit from the platform, or fail. */
  readonly skillsRef?: string;
}

/** A full commit sha, lowercased — the only form the platform resolves. */
export function normalizeSkillsRef(ref: string): string | null {
  const trimmed = ref.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(trimmed) ? trimmed : null;
}

/** True when `cliVersion` meets `minCliVersion`. An unreadable version never meets a floor. */
function meetsFloor(cliVersion: string, minCliVersion: string | null): boolean {
  if (minCliVersion === null) return true;
  const order = compareVersions(cliVersion, minCliVersion);
  return order !== null && order >= 0;
}

function upgradeWarning(commitSha: string, minCliVersion: string, cliVersion: string): string {
  return (
    `Skills commit ${commitSha.slice(0, 12)} is written for CLI ${minCliVersion} or newer, and this ` +
    `is ${cliVersion}: it may tell your agent to run commands this CLI does not have. ` +
    `Run "nexus upgrade", then run this command again.`
  );
}

/**
 * Pick the corpus an install writes.
 *
 * The platform's latest corpus is the default, because it is the only source that
 * moves when the skills repository does. Anything that stops it being used — no
 * network, a timeout, a 404, a checksum mismatch, a corpus written for a newer
 * CLI — falls back to the corpus bundled with this CLI and says why. A pinned
 * `--skills-ref` does NOT fall back: an install that silently wrote a different
 * commit would not be the reproducible install the flag exists for, so its
 * failure is thrown as a {@link PlatformCorpusError}.
 */
export async function resolveInstallCorpus(
  choice: CorpusChoice,
  io: PlatformIo
): Promise<ResolvedCorpus> {
  if (choice.bundled) {
    return {
      corpus: bundledCorpus(),
      source: "bundled",
      fallbackReason: null,
      minCliVersion: null,
      warnings: []
    };
  }

  if (choice.skillsRef !== undefined) {
    const manifest = await fetchManifest(io, choice.skillsRef);
    const corpus = await fetchCorpus(io, manifest);
    const warnings =
      manifest.minCliVersion !== null && !meetsFloor(io.cliVersion, manifest.minCliVersion)
        ? [upgradeWarning(manifest.commitSha, manifest.minCliVersion, io.cliVersion)]
        : [];
    return {
      corpus,
      source: "pinned",
      fallbackReason: null,
      minCliVersion: manifest.minCliVersion,
      warnings
    };
  }

  const fallBack = (reason: string, warnings: string[] = []): ResolvedCorpus => {
    const bundled = bundledCorpus();
    return {
      corpus: bundled,
      source: "bundled",
      fallbackReason: reason,
      minCliVersion: null,
      warnings: [
        ...warnings,
        `Installing the skills bundled with this CLI (commit ${bundled.commitSha.slice(0, 12)}) ` +
          `instead of the latest: ${reason}.`
      ]
    };
  };

  try {
    const manifest = await fetchManifest(io, "latest");
    if (manifest.minCliVersion !== null && !meetsFloor(io.cliVersion, manifest.minCliVersion)) {
      return fallBack(`the latest skills need CLI ${manifest.minCliVersion} or newer`, [
        upgradeWarning(manifest.commitSha, manifest.minCliVersion, io.cliVersion)
      ]);
    }
    const corpus = await fetchCorpus(io, manifest);
    return {
      corpus,
      source: "platform",
      fallbackReason: null,
      minCliVersion: manifest.minCliVersion,
      warnings: []
    };
  } catch (error: unknown) {
    if (error instanceof PlatformCorpusError) return fallBack(error.message);
    throw error;
  }
}
