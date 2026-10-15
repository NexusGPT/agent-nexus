import type { Command } from "commander";

import { color, isJsonMode } from "../../output";
import { getSkillList, SKILLS_NEXUS_SHA } from "../../skills-content.generated";
import { platformIo } from "../../skills-corpus/command";
import { fetchManifest, PlatformCorpusError } from "../../skills-corpus/platform";

const VERSION_HELP = `
Examples:
  $ nexus skills version
  $ nexus skills version --json

Notes:
  TWO COMMITS, AND THEY ANSWER DIFFERENT QUESTIONS. skillsSha is the commit the
  skills BUNDLED WITH THIS CLI were cut from — the fallback an install uses
  offline, or with --bundled — and skillCount counts those skills. Both move only
  when the CLI is upgraded.
  latestSkillsSha is the latest corpus the platform serves — what "nexus skills
  update" installs by default. It moves every time the skills repository
  deploys, with no CLI release. null means the platform could not be read, and
  latestError says why; nothing else in the output changes.
  latestMinCliVersion is the oldest CLI that latest corpus declares it is written
  for. When it is newer than cliVersion, "nexus skills update" installs the
  bundled skills instead and tells you to run "nexus upgrade".
  The commit a project actually has installed is recorded as "corpus" in its
  .claude/.nexus-install-manifest.json.`;

/** `nexus skills version` */
export function registerSkillsVersionCommand(skills: Command, _program: Command): void {
  skills
    .command("version")
    .description("Show this CLI's version, its bundled skills commit, and the latest one")
    .addHelpText("after", VERSION_HELP)
    .action(async (_opts: unknown, command: Command) => {
      const io = platformIo(command);
      let latestSkillsSha: string | null = null;
      let latestMinCliVersion: string | null = null;
      let latestError: string | null = null;
      try {
        const manifest = await fetchManifest(io, "latest");
        latestSkillsSha = manifest.commitSha;
        latestMinCliVersion = manifest.minCliVersion;
      } catch (error: unknown) {
        if (!(error instanceof PlatformCorpusError)) throw error;
        latestError = error.message;
      }

      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              cliVersion: io.cliVersion,
              skillsSha: SKILLS_NEXUS_SHA,
              skillCount: getSkillList().length,
              latestSkillsSha,
              latestMinCliVersion,
              latestError
            },
            null,
            2
          )
        );
        return;
      }
      console.log(`\n  CLI version:           ${color.cyan(io.cliVersion)}`);
      console.log(`  Bundled skills commit: ${color.cyan(SKILLS_NEXUS_SHA)}`);
      console.log(`  Bundled skills:        ${color.cyan(String(getSkillList().length))}`);
      console.log(
        latestSkillsSha === null
          ? `  Latest skills commit:  ${color.yellow(`unknown — ${latestError}`)}`
          : `  Latest skills commit:  ${color.cyan(latestSkillsSha)}` +
              (latestMinCliVersion ? color.dim(` (needs CLI ${latestMinCliVersion}+)`) : "")
      );
      console.log(color.dim(`\n  Install the latest: nexus skills update\n`));
    });
}
