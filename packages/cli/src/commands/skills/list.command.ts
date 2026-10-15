import type { Command } from "commander";

import { color, isJsonMode } from "../../output";
import {
  type CorpusFlags,
  describeCorpus,
  platformIo,
  resolveCorpusForCommand,
  withCorpusFlags
} from "../../skills-corpus/command";

const LIST_HELP = `
Examples:
  $ nexus skills list
  $ nexus skills list --json

Notes:
  THE NAME IN THE TABLE IS NOT THE NAME THE INSTALLER TAKES. This listing prints
  each slug with its "nexus-" prefix stripped, so a row reads "workflow-builder"
  while the slug is "nexus-workflow-builder". "nexus skills update" matches the
  SLUG exactly and refuses anything else, printing the full available list — so
  copying a name out of this table is refused rather than silently ignored.
  --json carries the unstripped slug on every row, so it is the form to read a
  name FROM. It also wraps the rows in cliVersion, skillsSha and source, which
  the table shows only in its last line.
  THIS LISTS WHAT AN INSTALL WOULD WRITE, FROM THE SAME SOURCE: the latest skills
  corpus on the platform, or the skills bundled with this CLI when the platform
  cannot be used. skillsSha is the commit listed, and source says which it was
  ("platform", "pinned" or "bundled"). --bundled and --skills-ref pick the
  source here exactly as they do on "nexus skills update".`;

/** `nexus skills list` */
export function registerSkillsListCommand(skills: Command, _program: Command): void {
  withCorpusFlags(skills.command("list"))
    .description("List the Claude Code skills an install would write")
    .addHelpText("after", LIST_HELP)
    .action(async (opts: CorpusFlags, command: Command) => {
      const io = platformIo(command);
      const resolved = await resolveCorpusForCommand(opts, io);
      if (!resolved) return;
      const { corpus } = resolved;

      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              cliVersion: io.cliVersion,
              skillsSha: corpus.commitSha,
              source: resolved.source,
              skills: corpus.skillList.map((slug) => ({
                slug,
                description: corpus.skills[slug].description,
                files: corpus.skills[slug].files.length
              }))
            },
            null,
            2
          )
        );
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
      console.log(color.dim(describeCorpus(resolved, io)));
      console.log(color.dim(`Install them: nexus skills update\n`));
    });
}
