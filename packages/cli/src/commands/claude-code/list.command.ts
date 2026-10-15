import type { Command } from "commander";

import { color, isJsonMode } from "../../output";
import {
  type CorpusFlags,
  describeCorpus,
  platformIo,
  resolveCorpusForCommand,
  withCorpusFlags
} from "../../skills-corpus/command";

/** `nexus claude-code list` */
export function registerClaudeCodeListCommand(cc: Command): void {
  withCorpusFlags(cc.command("list"))
    .description("List the Claude Code skills an install would write")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus claude-code list
  $ nexus claude-code list --json

Notes:
  THE NAME IN THE TABLE IS NOT THE NAME THE INSTALLER TAKES. This listing prints
  each slug with its "nexus-" prefix stripped, so a row reads "workflow-builder"
  while the slug is "nexus-workflow-builder". "nexus skills update" matches the
  SLUG exactly and refuses anything else, printing the full available list — so
  copying a name out of this table is refused rather than silently ignored.
  --json carries the unstripped slug, plus each skill's description and its file
  count.
  THIS LISTS WHAT AN INSTALL WOULD WRITE, FROM THE SAME SOURCE. By default that
  is the latest skills corpus on the platform, fetched the same way "nexus skills
  update" fetches it, and the skills bundled with this CLI when the platform
  cannot be reached. --bundled and --skills-ref pick the source here exactly as
  they do on the install.`
    )
    .action(async (opts: CorpusFlags, command: Command) => {
      const resolved = await resolveCorpusForCommand(opts, platformIo(command));
      if (!resolved) return;
      const { corpus } = resolved;

      if (isJsonMode()) {
        const skills = corpus.skillList.map((slug) => ({
          slug,
          description: corpus.skills[slug].description,
          files: corpus.skills[slug].files.length
        }));
        console.log(JSON.stringify(skills, null, 2));
        return;
      }

      console.log(color.bold(`\nClaude Code skills (${corpus.skillList.length}):\n`));
      for (const slug of corpus.skillList) {
        const entry = corpus.skills[slug];
        const name = slug.replace("nexus-", "");
        console.log(`  ${color.cyan(name.padEnd(22))} ${entry.description}`);
        console.log(`  ${"".padEnd(22)} ${color.dim(`${entry.files.length} files`)}`);
        console.log();
      }
      console.log(color.dim(describeCorpus(resolved, platformIo(command))));
      console.log(
        color.dim(
          `Install the latest skills: nexus skills update\nInstall specific ones: nexus skills update <skill>\n`
        )
      );
    });
}
