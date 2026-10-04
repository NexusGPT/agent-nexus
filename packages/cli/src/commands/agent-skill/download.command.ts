import fs from "node:fs";
import path from "node:path";

import type { Command } from "commander";

import { createClient, timeoutSecondsToMs } from "../../client";
import { handleError, reportFailure } from "../../errors";
import { isJsonMode, printSuccess } from "../../output";
import {
  DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS,
  downloadWithStallDeadline
} from "../../util/stall-deadline";

const DOWNLOAD_HELP = `
Examples:
  $ nexus agent-skill download 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus agent-skill download 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --output ./bundle.zip
  $ nexus agent-skill download 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --url-only

Notes:
  THE PRESIGNED URL EXPIRES AFTER 15 MINUTES. --url-only prints it and downloads
  nothing, so a URL captured into a script or a ticket is dead within the
  quarter-hour and fails at fetch time, not here. Download in the same run
  unless you are handing the URL to something that will use it immediately.
  Without --output the file lands at ./<skill-name>.zip in the working directory,
  overwriting whatever is already there.
  This is a read route: it works on an agent that has since been moved off a
  code-interpreter model.`;

/** `nexus agent-skill download` */
export function registerAgentSkillDownloadCommand(skill: Command, program: Command): Command {
  const leaf = skill
    .command("download")
    .description("Download a skill's bundle as a .zip")
    .argument("<agent-id>", "Agent ID")
    .argument("<skill-id>", "Skill ID")
    .option("--output <path>", "Where to write the .zip (default ./<skill-name>.zip)")
    .option("--url-only", "Print the presigned URL instead of downloading")
    .addHelpText("after", DOWNLOAD_HELP)
    .action(
      async (agentId: string, skillId: string, opts: { output?: string; urlOnly?: boolean }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const { url } = await client.agents.skills.getDownloadUrl(agentId, skillId);

          if (opts.urlOnly) {
            if (isJsonMode()) console.log(JSON.stringify({ url }, null, 2));
            else console.log(url);
            return;
          }

          const skillMeta = await client.agents.skills.get(agentId, skillId);
          const target = path.resolve(opts.output ?? `${skillMeta.name}.zip`);
          // 🚨 A RAW `fetch` THROWS A PLAIN `Error`, AND `handleError` CANNOT
          // TELL WHAT IT WAS. It is not a `NexusConnectionError` — the SDK never
          // saw it — so both a dead network and a 403 from S3 fell through to
          // `CLI_UNKNOWN_ERROR`, and a script could not tell "retry this" from
          // "your presigned url expired". Found by the code gate, not by reading.
          //
          // 🔴 AND IT CARRIED NO DEADLINE AT ALL, SO A PRESIGNED HOST THAT
          // ACCEPTED THE CONNECTION AND NEVER ANSWERED HUNG THE COMMAND FOR
          // EVER. The budget is on SILENCE rather than on elapsed time: a skill
          // bundle is up to 5 MB and its size is not known before the transfer
          // starts, so a total deadline tight enough to catch a dead socket
          // would abort a large download on a slow link — trading a hang for a
          // refused transfer that was going to succeed.
          let response: Response;
          let payload: Buffer;
          try {
            ({ response, body: payload } = await downloadWithStallDeadline(
              url,
              {},
              {
                timeout:
                  timeoutSecondsToMs(program.optsWithGlobals().timeout as number | undefined) ??
                  DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS
              }
            ));
          } catch (networkError) {
            process.exitCode = reportFailure(
              "connection-failed",
              `Could not reach the download URL: ${
                networkError instanceof Error ? networkError.message : String(networkError)
              }`
            );
            return;
          }
          if (!response.ok) {
            process.exitCode = reportFailure(
              "remote-error",
              `Download failed — ${response.status} ${response.statusText}.`,
              "The presigned URL expires after 15 minutes; re-run to get a fresh one."
            );
            return;
          }
          fs.writeFileSync(target, payload);
          printSuccess(`Skill downloaded to ${target}`, { id: skillId, name: skillMeta.name });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
