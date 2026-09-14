import type { Command } from "commander";

import { resolveBaseUrl } from "../config";
import { refuse, reportFailure } from "../errors";
import { color } from "../output";
import { PlatformCorpusError, type PlatformIo } from "./platform";
import {
  type CorpusChoice,
  normalizeSkillsRef,
  type ResolvedCorpus,
  resolveInstallCorpus
} from "./resolve";

/** This binary's version, as the platform's `minCliVersion` is compared against. */
export function cliVersion(): string {
  return (require("../../package.json") as { version: string }).version;
}

/** The options every command that reads a corpus declares. */
export interface CorpusFlags {
  bundled?: boolean;
  skillsRef?: string;
}

/** Declare `--bundled` and `--skills-ref` on a command, with one wording everywhere. */
export function withCorpusFlags(command: Command): Command {
  return command
    .option("--bundled", "Use the skills bundled with this CLI; make no network call")
    .option(
      "--skills-ref <commit>",
      "Use exactly this skills commit (full 40-character sha) from the platform; no fallback"
    );
}

/** The platform the corpus is read from: `--base-url`, then `--profile`, `NEXUS_BASE_URL`, the active profile. */
export function platformIo(command: Command): PlatformIo {
  const globals = command.optsWithGlobals() as {
    baseUrl?: string;
    profile?: string;
    timeout?: number;
  };
  return {
    baseUrl: resolveBaseUrl(globals.baseUrl, globals.profile),
    cliVersion: cliVersion(),
    fetch: (input, init) => fetch(input, init),
    globals
  };
}

/**
 * Resolve the corpus for a command, or report why not and return null with the
 * exit code set. Warnings go to STDERR in every mode, so a `--json` document on
 * stdout stays one parseable value while the user still reads why the install
 * fell back.
 */
export async function resolveCorpusForCommand(
  flags: CorpusFlags,
  io: PlatformIo
): Promise<ResolvedCorpus | null> {
  if (flags.bundled && flags.skillsRef !== undefined) {
    process.exitCode = refuse(
      "--bundled and --skills-ref name two different corpora.",
      "Pass one: --bundled for the skills compiled into this CLI, --skills-ref for one platform commit."
    );
    return null;
  }

  let skillsRef: string | undefined;
  if (flags.skillsRef !== undefined) {
    const normalized = normalizeSkillsRef(flags.skillsRef);
    if (normalized === null) {
      process.exitCode = refuse(
        `--skills-ref must be a full 40-character commit sha, not "${flags.skillsRef}".`,
        'Copy it from "nexus skills version" or from the "corpus" record in .claude/.nexus-install-manifest.json.'
      );
      return null;
    }
    skillsRef = normalized;
  }
  const choice: CorpusChoice = { bundled: flags.bundled, skillsRef };

  let resolved: ResolvedCorpus;
  try {
    resolved = await resolveInstallCorpus(choice, io);
  } catch (error: unknown) {
    if (!(error instanceof PlatformCorpusError)) throw error;
    process.exitCode = reportFailure(
      error.failure,
      `Could not install skills commit ${choice.skillsRef}: ${error.message}.`,
      "A pinned install never falls back. Check the sha, or drop --skills-ref to install the latest."
    );
    return null;
  }

  for (const warning of resolved.warnings) process.stderr.write(color.yellow(`${warning}\n`));
  return resolved;
}

/** One line naming the corpus and where it came from, for a person. */
export function describeCorpus(resolved: ResolvedCorpus, io: PlatformIo): string {
  const commit = `skills-nexus @ ${resolved.corpus.commitSha.slice(0, 12)}`;
  const host = (() => {
    try {
      return new URL(io.baseUrl).host;
    } catch {
      return io.baseUrl;
    }
  })();
  switch (resolved.source) {
    case "platform":
      return `Skills: ${commit} — the latest, from ${host}`;
    case "pinned":
      return `Skills: ${commit} — pinned with --skills-ref, from ${host}`;
    case "bundled":
      return resolved.fallbackReason === null
        ? `Skills: ${commit} — bundled with CLI ${io.cliVersion} (--bundled)`
        : `Skills: ${commit} — bundled with CLI ${io.cliVersion}, because the latest could not be used`;
  }
}

/** The corpus as a `--json` document reports it. */
export function corpusJson(resolved: ResolvedCorpus): {
  commitSha: string;
  source: ResolvedCorpus["source"];
  fallbackReason: string | null;
  minCliVersion: string | null;
} {
  return {
    commitSha: resolved.corpus.commitSha,
    source: resolved.source,
    fallbackReason: resolved.fallbackReason,
    minCliVersion: resolved.minCliVersion
  };
}
