import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { DEFAULT_PRESET_REPO } from "../../util/skill-bundle.presets";
import { resolvePresets } from "../../util/skill-bundle.resolve-presets";
import { attachPresetBundles } from "./add-preset.attach";
import { buildPresetBundles } from "./add-preset.bundles";
import { printDryRunPlan } from "./add-preset.dry-run";

/** `nexus agent-skill add-preset` */
export function registerAgentSkillAddPresetCommand(skill: Command, program: Command): Command {
  const leaf = skill
    .command("add-preset")
    .description("Attach one of the baseline Anthropic skills to an agent")
    .argument("<agent-id>", "Agent ID")
    .argument("<presets...>", "Preset or group names (see 'nexus agent-skill presets')")
    .option("--ref <git-ref>", "Branch, tag, or commit of the source repo", "main")
    .option("--repo <owner/name>", "Source repository", DEFAULT_PRESET_REPO)
    .option("--from-dir <path>", "Use a local checkout of the source repo instead of downloading")
    .option("--replace", "Replace the bundle when a skill of the same name already exists")
    .option(
      "--dry-run",
      "Show what would be attached without calling Nexus (still fetches the source)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-skill add-preset 11111111-1111-4111-8111-111111111111 skill-creator
  $ nexus agent-skill add-preset 11111111-1111-4111-8111-111111111111 office              # docx, pdf, pptx, xlsx
  $ nexus agent-skill add-preset 11111111-1111-4111-8111-111111111111 pptx xlsx --replace
  $ nexus agent-skill add-preset 11111111-1111-4111-8111-111111111111 all --ref v1.2.0
  $ nexus agent-skill add-preset 11111111-1111-4111-8111-111111111111 pdf --from-dir ~/src/anthropics-skills

Notes:
  The bundles are Anthropic's, fetched from github.com/${DEFAULT_PRESET_REPO} at run time
  rather than shipped inside this CLI; their LICENSE.txt travels with each skill.
  Pin a version with --ref, or work offline with --from-dir.
  Without --replace, a preset whose name is already attached is skipped.
  --dry-run SKIPS NEXUS, NOT GITHUB. It still downloads and unpacks the source
  tarball so it can report real file counts and sizes, then returns before any
  Nexus call. It is not an offline preview — pair it with --from-dir for that.
  The agent's model must support the code interpreter, or the API returns 400.`
    )
    .action(
      async (
        agentId: string,
        presetNames: string[],
        opts: {
          ref: string;
          repo: string;
          fromDir?: string;
          replace?: boolean;
          dryRun?: boolean;
        }
      ) => {
        try {
          const presets = resolvePresets(presetNames);
          const source = {
            ref: opts.ref,
            repo: opts.repo,
            ...(opts.fromDir !== undefined ? { fromDir: opts.fromDir } : {}),
            timeoutSeconds: program.optsWithGlobals().timeout as number | undefined
          };
          const bundles = await buildPresetBundles(presets, source);

          if (opts.dryRun) {
            printDryRunPlan(agentId, bundles, source);
            return;
          }

          const client = createClient(program.optsWithGlobals());
          await attachPresetBundles(client, agentId, bundles, Boolean(opts.replace));
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
