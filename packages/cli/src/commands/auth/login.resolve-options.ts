import type { Command } from "commander";

import { resolveBaseUrl } from "../../config";

/**
 * Which commander slot each `auth login` flag landed in, and the two addresses
 * derived from them.
 *
 * ITS OWN FILE because `login.command.ts` reached 148 of the 150-line
 * `max-lines` cap this package enforces at severity 2 — and
 * `source-file-size.ledger.test.ts` is a SHRINK-ONLY ledger over the same
 * directory at the same ceiling, so a file crossing it does not merely fail
 * lint, it demands a ledger row in the one direction that programme is trying
 * to drain. Two lines of margin is a landmine for whoever adds the next flag.
 *
 * The split also follows the convention already in this directory —
 * `login.prompter.ts`, `login.resolve-key.ts`, `login.resolve-profile-name.ts`,
 * `login.run.ts`, `login.save.ts`, `login.tips.ts`: one concern per file, named
 * for the concern. Reading argv is a concern.
 */

/** Every option `auth login` reads, across both of commander's slots. */
export interface LoginOptions {
  apiKey?: string;
  profile?: string;
  env?: string;
  baseUrl?: string;
  dashboardUrl?: string;
  timeout?: number;
  overwrite?: boolean;
}

/** The flags merged, and the two addresses resolved from them. */
export interface ResolvedLoginOptions {
  effective: LoginOptions;
  baseUrl: string | undefined;
  dashboardUrl: string | undefined;
  resolvedBaseUrl: string;
}

/** Merge the flag slots, then resolve the two addresses. */
export function resolveLoginOptions(command: Command, opts: LoginOptions): ResolvedLoginOptions {
  // Commander 13 routes `--api-key` / `--profile` to the program-level
  // global flag slot when both global (index.ts) and subcommand-local
  // options share a name — the local `opts` ends up empty even though the
  // value was on argv. `optsWithGlobals()` merges both so we see the user's
  // value regardless of which definition commander chose. Without this,
  // `nexus auth login --api-key nxs_X --profile foo` silently falls into
  // interactive mode because opts.apiKey is undef.
  //
  // `--overwrite` collides with no global, so it arrives in both slots. It is
  // named in the cast anyway: an unnamed field is exactly how `--base-url`
  // came to be merged, untyped and unread, in the defect below.
  const merged = command.optsWithGlobals() as LoginOptions;
  const effective: LoginOptions = { ...opts, ...merged };

  // 🚨 `baseUrl` AND `dashboardUrl` WERE MISSING FROM THE CAST ABOVE, so the
  // globals were on argv, were merged onto this object, and were then untyped
  // and unread. `--base-url` did nothing on this command at all — and the
  // command's help text tells the reader to use it for any address other than
  // the `--env dev` pair. The probe went to whatever `resolveBaseUrl()` found
  // for some OTHER profile, and the created profile stored no host.
  //
  // `--env dev` is a NAMED PAIR of hardcoded localhost ports. An explicit
  // address is the more specific statement of the two, so it outranks the
  // named environment — the same ordering `resolveBaseUrl` applies everywhere
  // else: what was typed in THIS invocation wins.
  const isDev = effective.env === "dev";
  const baseUrl = effective.baseUrl ?? (isDev ? "http://localhost:3001" : undefined);
  const dashboardUrl = effective.dashboardUrl ?? (isDev ? "http://localhost:3000" : undefined);

  // ⚠️ NO PROFILE ARGUMENT, AND THAT IS NOT AN OVERSIGHT. `--profile` here
  // names the profile this command is about to CREATE, not one to read a host
  // out of — reading it would make the probe target depend on the profile
  // being overwritten. The override IS passed, which is the half that was
  // missing. `base-url-precedence-is-one-rule.test.ts` carries this site as
  // its one sanctioned partial caller, with this reason.
  return { effective, baseUrl, dashboardUrl, resolvedBaseUrl: resolveBaseUrl(baseUrl) };
}
