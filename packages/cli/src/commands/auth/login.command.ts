import type { Command } from "commander";

import { resolveBaseUrl } from "../../config";
import { reportFailure } from "../../errors";
import { createPrompter } from "./login.prompter";
import { runLogin } from "./login.run";

const LOGIN_HELP = `
Examples:
  $ nexus auth login
  $ nexus auth login --api-key nxs_abc123
  $ nexus auth login --profile work --api-key nxs_abc123
  $ nexus auth login --env dev

Notes:
  API keys start with "nxs_". Get yours at https://app.nexusgpt.io/app/settings/api-keys
  Use --profile to name the saved profile (default: org name or "default").
  Run "nexus auth list" to see all profiles, "nexus auth switch <name>" to change active.

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
    .addHelpText("after", LOGIN_HELP)
    .action(async (opts, command) => {
      // Commander 13 routes `--api-key` / `--profile` to the program-level
      // global flag slot when both global (index.ts) and subcommand-local
      // (above) options share a name — the local `opts` ends up empty even
      // though the value was on argv. `optsWithGlobals()` merges both so we
      // see the user's value regardless of which definition commander chose.
      // Without this, `nexus auth login --api-key nxs_X --profile foo`
      // silently falls into interactive mode because opts.apiKey is undef.
      const merged = command.optsWithGlobals() as {
        apiKey?: string;
        profile?: string;
        env?: string;
        baseUrl?: string;
        dashboardUrl?: string;
        timeout?: number;
      };
      const effective = { ...opts, ...merged };

      // 🚨 `baseUrl` AND `dashboardUrl` WERE MISSING FROM THE CAST ABOVE, so
      // the globals were on argv, were merged onto this object, and were then
      // untyped and unread. `--base-url` did nothing on this command at all —
      // and the help text directly above tells the reader to use it for any
      // address other than the `--env dev` pair. The probe went to whatever
      // `resolveBaseUrl()` found for some OTHER profile, and the created
      // profile stored no host.
      //
      // `--env dev` is a NAMED PAIR of hardcoded localhost ports. An explicit
      // address is the more specific statement of the two, so it outranks the
      // named environment — the same ordering `resolveBaseUrl` applies
      // everywhere else: what was typed in THIS invocation wins.
      const isDev = effective.env === "dev";
      const baseUrl = effective.baseUrl ?? (isDev ? "http://localhost:3001" : undefined);
      const dashboardUrl = effective.dashboardUrl ?? (isDev ? "http://localhost:3000" : undefined);

      // ⚠️ NO PROFILE ARGUMENT, AND THAT IS NOT AN OVERSIGHT. `--profile` here
      // names the profile this command is about to CREATE, not one to read a
      // host out of — reading it would make the probe target depend on the
      // profile being overwritten. The override IS passed, which is the half
      // that was missing. `base-url-precedence-is-one-rule.test.ts` carries
      // this site as its one sanctioned partial caller, with this reason.
      const resolvedBaseUrl = resolveBaseUrl(baseUrl);

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
        process.exitCode = reportFailure("local-failed", (err as Error).message);
      } finally {
        prompter.close();
      }
    });
  return leaf;
}
