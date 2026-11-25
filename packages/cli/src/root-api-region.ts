import { isNexusRegion, NEXUS_REGION_BASE_URLS, NEXUS_REGIONS } from "@agent-nexus/sdk";
import { type Command, Option } from "commander";

/**
 * `--api-region <eu|us>` — TARGET A NEXUS DEPLOYMENT BY NAME.
 *
 * A region is a name for an API base URL, and the table of names lives in
 * `@agent-nexus/sdk` (`NEXUS_REGION_BASE_URLS`), which this CLI bundles. So the
 * US host is spelled once, in the SDK, and never here.
 *
 * ── WHY THE FLAG IS `--api-region` AND NOT `--region` ────────────────────────
 *
 * `--region` already exists on four subcommands with OTHER meanings — an AWS
 * region on `apps cluster provision` and `admin vibe-tenant-cluster provision`,
 * a Twilio edge on `channel setup` and `channel connection create`. A global of
 * the same spelling would shadow all four, and
 * `util/global-option-shadowing.exceptions.ts` says what that calls for: RENAME
 * when the two options mean different things. Renaming four published flags
 * would break every script that uses them, so the new global takes the name.
 *
 * ── HOW IT REACHES EVERY REQUEST: ONE TRANSLATION, NOT A SIXTH PRECEDENCE ────
 *
 * {@link applyApiRegion} runs in the root `preAction` hook and, when no
 * `--base-url` was typed, sets the ROOT program's `baseUrl` option to the
 * region's host. Every reader of the base URL already takes it from
 * `optsWithGlobals().baseUrl` and hands it to `resolveBaseUrl` as the
 * override, so the region is honoured everywhere `--base-url` is, by the same
 * code — `base-url-precedence-is-one-rule.test.ts` keeps that code single,
 * and a region term added to the resolver's signature would instead be one
 * more argument every call site could drop.
 *
 * The resulting order: `--base-url` > `--api-region` > a named `--profile`'s
 * stored host > `NEXUS_BASE_URL` > the active profile > `NEXUS_ENV`. Both
 * flags are typed into THIS invocation, so both outrank anything stored or
 * exported; the more specific of the two wins when both are given.
 */

/** The option, declared here so its accepted names come from the SDK's table. */
export function apiRegionOption(): Option {
  return new Option(
    "--api-region <region>",
    `Target a Nexus deployment by name (${NEXUS_REGIONS.join(", ")}); --base-url wins over it`
  ).choices([...NEXUS_REGIONS]);
}

/**
 * Translate `--api-region` into the root `baseUrl` option, unless `--base-url`
 * was typed — which is the precedence, stated as the early return.
 *
 * `choices` above already refuses an unknown name at parse time; the guard
 * here is what narrows the untyped option value, and it throws rather than
 * resolving if anything ever bypasses the parser.
 */
export function applyApiRegion(thisCommand: Command): void {
  const opts = thisCommand.optsWithGlobals();
  const region: unknown = opts.apiRegion;
  if (region === undefined) return;
  if (typeof region !== "string" || !isNexusRegion(region)) {
    throw new Error(
      `--api-region must be one of ${NEXUS_REGIONS.join(", ")}; got ${JSON.stringify(region)}.`
    );
  }
  if (opts.baseUrl) return;

  let root = thisCommand;
  while (root.parent) root = root.parent;
  root.setOptionValueWithSource("baseUrl", NEXUS_REGION_BASE_URLS[region], "cli");
}
