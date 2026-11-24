import type { Command } from "commander";

import { handleError, reportFailure } from "../../errors";
import { CategorizedCliError } from "../../exit-codes";
import { createPrompter } from "./login.prompter";
import { resolveLoginOptions } from "./login.resolve-options";
import { runLogin } from "./login.run";

const LOGIN_HELP = `
Examples:
  $ nexus auth login
  $ nexus auth login --api-key nxs_abc123
  $ nexus auth login --profile work --api-key nxs_abc123
  $ nexus auth login --env dev
  $ nexus auth login --api-key nxs_abc123 --profile work --overwrite

Notes:
  API keys start with "nxs_". Get yours at https://app.nexusgpt.io/app/settings/api-keys
  Use --profile to name the saved profile (default: org name or "default").
  Run "nexus auth list" to see all profiles, "nexus auth switch <name>" to change active.

  --overwrite ANSWERS THE "already exists. Overwrite?" PROMPT, and nothing else.
  Re-logging in to a profile that already exists asks before replacing it, which
  is unanswerable in a script; pass --overwrite to consent in the invocation. It
  grants nothing beyond that one question — the stored key and URLs of that one
  profile are replaced, and no other profile is touched.

  --env dev MEANS TWO HARDCODED LOCALHOST PORTS, AND THEY ARE STORED ON THE
  PROFILE. It points the API at http://localhost:3001 and the dashboard at
  http://localhost:3000 — the ports are fixed, not read from anything you can
  set, so a local stack listening elsewhere cannot be reached this way. Pass
  --base-url instead for any other address. Because both URLs are written onto
  the saved profile, a profile created with --env dev keeps pointing at
  localhost until you log in again.`;

/** `nexus auth login` */
export function registerAuthLoginCommand(auth: Command, _program: Command): Command {
  const leaf = auth
    .command("login")
    .description("Authenticate with the Nexus API and create a profile")
    .option("--api-key <key>", "API key (skip interactive prompt)")
    .option("--profile <name>", "Profile name to save as")
    .option("--env <env>", "Environment: dev or production", "production")
    .option("--overwrite", "Overwrite an existing profile without prompting")
    .addHelpText("after", LOGIN_HELP)
    .action(async (opts, command) => {
      const { effective, baseUrl, dashboardUrl, resolvedBaseUrl } = resolveLoginOptions(
        command,
        opts
      );

      // 🔴 ONE ORGANISM. The interface, its line queue and its close() are taken
      // together and released by the `finally` below — a fresh interface per
      // prompt exited 0 without ever saving, on piped stdin (NEX-1879 defect 3).
      const prompter = createPrompter();

      try {
        await runLogin({ ask: prompter.ask, effective, baseUrl, dashboardUrl, resolvedBaseUrl });
      } catch (err) {
        // Every network call inside `runLogin` is caught at its own site, so
        // what reaches here is local: a readline that ended before the prompts
        // were answered, a config write, a browser spawn.
        //
        // 🔴 EXCEPT A THROW THAT ALREADY CARRIES ITS OWN CATEGORY. `local-failed`
        // restamps it — exit 9 under a document saying something else — and the
        // prompter's refusal for an unseeable question is one: it is the
        // INVOCATION that cannot be satisfied, not a local step that failed.
        // `handleError` is the dispatch that prints such an error's own document
        // and returns its own code.
        process.exitCode =
          err instanceof CategorizedCliError
            ? handleError(err)
            : reportFailure("local-failed", (err as Error).message);
      } finally {
        prompter.close();
      }
    });
  return leaf;
}
