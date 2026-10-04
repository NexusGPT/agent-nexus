import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { formatBytes } from "../../util/skill-bundle.format-bytes";
import { packSkillZip } from "../../util/skill-bundle.pack-skill-zip";
import { readSkillDirectory } from "../../util/skill-bundle.read-skill-directory";
import { readZipFile } from "./_shared/read-zip-file";
import { toBlob } from "./_shared/to-blob";

/** `nexus agent-skill upload` */
export function registerAgentSkillUploadCommand(skill: Command, program: Command): Command {
  const leaf = skill
    .command("upload")
    .description("Replace an existing skill's files")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .option("--file <path>", "Skill bundle as a .zip")
    .option("--dir <path>", "Skill folder to package (must contain SKILL.md)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill upload 11111111-1111-4111-8111-111111111111 33333333-3333-4333-8333-333333333333 --dir ./skills/invoice-parser
  $ nexus agent-skill upload 11111111-1111-4111-8111-111111111111 33333333-3333-4333-8333-333333333333 --file ./invoice-parser.zip

Notes:
  The upload REPLACES the skill's contents; files not in the new bundle are removed.`
    )
    .action(async (agentId: string, skillId: string, opts: { file?: string; dir?: string }) => {
      try {
        if (Boolean(opts.file) === Boolean(opts.dir)) {
          process.exitCode = refuse("Pass exactly one of --file or --dir.");
          return;
        }

        const bundle = opts.file
          ? readZipFile(opts.file)
          : packSkillZip(readSkillDirectory(opts.dir as string), opts.dir as string);

        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.skills.uploadZip(agentId, skillId, toBlob(bundle));
        printSuccess("Skill bundle replaced.", {
          id: result.id,
          files: result.fileCount,
          size: formatBytes(result.sizeBytes)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
