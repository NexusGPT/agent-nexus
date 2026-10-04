import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { formatBytes } from "../../util/skill-bundle.format-bytes";
import { packSkillZip } from "../../util/skill-bundle.pack-skill-zip";
import { readSkillDirectory } from "../../util/skill-bundle.read-skill-directory";
import { AGENT_SKILL_CREATE_CONTRACT } from "../agent-skill.contract.generated";
import { readZipFile } from "./_shared/read-zip-file";
import { toBlob } from "./_shared/to-blob";

/** `nexus agent-skill create` */
export function registerAgentSkillCreateCommand(skill: Command, program: Command): Command {
  const leaf = skill
    .command("create")
    .description("Attach a skill to an agent from a ZIP, a folder, or an empty scaffold")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--name <name>", "Skill name (lowercase letters, digits, hyphens)")
    .option("--description <text>", "What the skill does")
    .option("--file <path>", "Skill bundle as a .zip")
    .option("--dir <path>", "Skill folder to package (must contain SKILL.md)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill create 11111111-1111-4111-8111-111111111111 --name invoice-parser --dir ./skills/invoice-parser
  $ nexus agent-skill create 11111111-1111-4111-8111-111111111111 --name invoice-parser --file ./invoice-parser.zip
  $ nexus agent-skill create 11111111-1111-4111-8111-111111111111 --name invoice-parser --description "Parse supplier invoices"

Notes:
  Omit --file/--dir to create the skill with a scaffolded SKILL.md you can fill in
  later with 'nexus agent-skill upload'.
  --dir accepts the skill folder itself, or a wrapper holding exactly one.
  THE BUNDLE'S OWN SKILL.md FRONTMATTER IS NOT READ. A --dir whose SKILL.md
  declares "description:" still stores description null unless you pass
  --description here or set it later with 'nexus agent-skill update'. The flow
  runs the other way: on a scaffold, --description is what gets WRITTEN into the
  generated SKILL.md.
  The agent's model must support the code interpreter, or the API returns 400.`
    )
    .action(
      async (
        agentId: string,
        opts: { name: string; description?: string; file?: string; dir?: string }
      ) => {
        try {
          if (opts.file && opts.dir) {
            process.exitCode = refuse("Pass --file or --dir, not both.");
            return;
          }

          const bundle = opts.file
            ? readZipFile(opts.file)
            : opts.dir
              ? packSkillZip(readSkillDirectory(opts.dir), opts.dir)
              : undefined;

          const client = createClient(program.optsWithGlobals());
          const created = await client.agents.skills.create(
            agentId,
            { name: opts.name, ...(opts.description ? { description: opts.description } : {}) },
            bundle ? toBlob(bundle) : undefined
          );

          printSuccess(`Skill "${created.name}" attached.`, {
            id: created.id,
            files: created.fileCount,
            size: formatBytes(created.sizeBytes)
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  bindCommand(leaf, AGENT_SKILL_CREATE_CONTRACT);
  return leaf;
}
