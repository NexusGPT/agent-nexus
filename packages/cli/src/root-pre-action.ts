import type { Command } from "commander";

import { UPGRADE_ALIASES } from "./commands/upgrade";
import { assertKnownNexusEnv, resolveProfile } from "./config";
import { isJsonMode, printContextBanner, setJsonMode } from "./output";

/**
 * Commands that print their own output and must not be preceded by the profile
 * banner. `auth`'s own verbs are spelled out because the hook fires on the LEAF,
 * so `thisCommand.name()` is `login`, never `auth`.
 */
const BANNER_FREE_COMMANDS: readonly string[] = [
  "auth",
  "upgrade",
  "version",
  "login",
  "logout",
  "whoami",
  "switch",
  "list",
  "pin",
  "unpin",
  "status",
  "docs",
  "claude-code",
  "skills",
  ...UPGRADE_ALIASES
];

/**
 * The root program's `preAction` hook — everything that must happen before any
 * action handler runs, for every command.
 *
 * Registered on the root in `index.ts`, so commander fires it once per
 * invocation on the leaf being run.
 */
export function rootPreAction(thisCommand: Command): void {
  const opts = thisCommand.optsWithGlobals();
  if (opts.json) setJsonMode(true);

  // 🔴 VALIDATE `NEXUS_ENV` HERE, BEFORE ANY ACTION HANDLER RUNS, BECAUSE A
  // REFUSAL THAT ARRIVES AFTER A WRITE IS WORSE THAN NO REFUSAL.
  //
  // `resolveBaseUrl` and `resolveDashboardUrl` walk INDEPENDENT chains and
  // each consults the environment name LAST, so the API host can be pinned
  // by any of four earlier terms while the console host falls all the way
  // through and throws. An active profile carrying a `baseUrl` and no
  // `dashboardUrl` reproduces it with no flag and no other variable set.
  // Roughly sixteen commands build their console link AFTER the mutating
  // call, so the resource was created and the process then exited non-zero
  // — which a script reads as a failed create and retries, duplicating it.
  //
  // Every command, with no exemption list. A name this CLI cannot resolve
  // breaks every host-resolving command anyway, so saying so at `version`
  // costs a line and an exemption list is one more thing to drift.
  //
  // ⚠️ AFTER `setJsonMode`, deliberately: the refusal has to be emitted as
  // the JSON error document when `--json` was passed. `parseAsync`'s
  // `.catch` in `root-run-cli.ts` routes it through `handleError`, which is
  // what turns it into the right exit code and the right document.
  assertKnownNexusEnv();

  // Show context banner (skip for auth/upgrade/version — they handle their own output)
  const cmdName = thisCommand.name();
  const skipBanner = BANNER_FREE_COMMANDS.includes(cmdName);
  if (!skipBanner && !isJsonMode()) {
    try {
      const resolved = resolveProfile(opts);
      printContextBanner(resolved);
    } catch {
      // No profile configured — skip banner, the command will error later
    }
  }
}
