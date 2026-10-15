import { Command } from "commander";

import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { WORKSPACE_MINT_MOUNT_CREDENTIALS_CONTRACT } from "./workspace.contract.generated";
import {
  type CredentialProcessOptions,
  runCredentialProcess
} from "./workspace-credential-process/credential-process.handler";
import { WORKSPACE_CREDENTIAL_PROCESS_HELP } from "./workspace-credential-process/credential-process-help";

// ── credential-process: the direct engine's refresh hook ──────────────────────
//
// rclone's AWS SDK runs `<node> <entry> workspace credential-process <mountId>`
// on the first S3 request at or after the `Expiration` the previous run
// reported, and kills it at 60 s. Everything under
// `workspace-credential-process/` is sized for that budget: one bounded client,
// a retry that stops inside `REFRESH_BUDGET_MS` and only ever absorbs a network
// blip, and a 30 s cooldown so a broken mount polled by Finder is not a POST
// storm.
//
// 🚨 STDOUT IS THE SDK'S. It holds exactly one JSON document — the AWS
// process-credentials shape — and nothing else, ever. Every diagnostic goes
// to stderr through the CLI's ordinary failure printers, which is also what
// puts an error document on stdout for a human who passed `--json`.

export function registerWorkspaceCredentialProcessCommand(ws: Command, program: Command): void {
  // ── credential-process ────────────────────────────────────────────────────
  const credentialProcess = ws
    .command("credential-process")
    .description(
      "Emit AWS process credentials for a direct-engine mount. Run by rclone's AWS SDK; not for interactive use."
    )
    .argument(
      "<mountId>",
      'The mount id — the 16 hex digits "nexus workspace status --json" reports as mountId for a direct-engine mount'
    )
    .option(
      "--check",
      "Validate the session and the credential_process line without printing a credential"
    )
    .addHelpText("after", WORKSPACE_CREDENTIAL_PROCESS_HELP)
    .action(async (mountId: string, opts: CredentialProcessOptions) => {
      try {
        process.exitCode = await runCredentialProcess(mountId, opts, program.optsWithGlobals());
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(credentialProcess, WORKSPACE_MINT_MOUNT_CREDENTIALS_CONTRACT, {
    "Body.access":
      "the access ceiling is chosen once, at mount time, and recorded in the mount's session; " +
      "a refresh asks for the recorded grade again and refuses anything lower"
  });
}
