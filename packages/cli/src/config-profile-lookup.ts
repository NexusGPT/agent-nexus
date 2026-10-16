import type { NexusConfigV2, ProfileSource, ResolvedProfile } from "./config-types";
import { CategorizedCliError } from "./exit-codes";

/**
 * THE TWO REFUSALS `resolveProfile` CAN REACH, EXTRACTED SO THE CHAIN ITSELF
 * STAYS READABLE IN ONE SCREEN.
 *
 * Neither selects anything — the ORDER of the selectors is the rule, and it
 * stays whole in `config-resolve.ts`. What lives here is the wording of the two
 * dead ends: a profile that was NAMED and is not there, and no profiles at all.
 */

/**
 * The profile called `name`, or a refusal naming WHERE the name came from.
 *
 * The source hint is the half that matters: "profile prod not found" sends the
 * reader to `auth list`, while "(from .nexusrc at /path)" sends them to the
 * pin file that is actually wrong. A caller that resolved the name from a flag,
 * an env var and a directory file cannot say which without being told.
 *
 * A plain `Error` rather than a {@link CategorizedCliError}: a name that does
 * not resolve is a bad INPUT, and `errors-handle.ts` already categorises a bare
 * throw. `exit-code-error.ts` records the history of this distinction.
 */
export function lookupProfile(
  config: NexusConfigV2,
  name: string,
  source: ProfileSource,
  rcPath?: string
): ResolvedProfile {
  const profile = config.profiles[name];
  if (!profile) {
    const available = Object.keys(config.profiles).join(", ");
    const sourceHint =
      source === "flag"
        ? `(from --profile flag)`
        : source === "env"
          ? `(from NEXUS_PROFILE env)`
          : source === "directory"
            ? `(from .nexusrc at ${rcPath})`
            : source === "active"
              ? `(active profile)`
              : `(default profile)`;

    throw new Error(
      `Profile "${name}" ${sourceHint} not found.` +
        (available
          ? ` Available: ${available}. Run: nexus auth list`
          : " No profiles configured. Run: nexus auth login")
    );
  }
  return { name, profile, source, rcPath };
}

/**
 * The end of the chain: nothing selected a profile and nothing can.
 *
 * Two distinct answers, because the fixes are different. Profiles EXIST and
 * none is active → `auth switch`. No profiles at all → `auth login`. Collapsing
 * them would tell a user with three stored profiles to log in again.
 *
 * `"CLI_NOT_AUTHENTICATED"` is spelled literally, as `"CLI_UNKNOWN_NEXUS_ENV"`
 * is in `config-env-resolve.ts` — `errors-cli-codes.ts` owns the registry, and
 * those two strings are the config layer's only contact with it.
 *
 * RETURNS the error for the caller to throw, rather than throwing itself: the
 * refusal belongs to `resolveProfile`'s own last step, and a `never`-returning
 * helper would make that step's control flow depend on TypeScript's narrowing
 * of an imported declaration instead of on a `throw` anyone can see.
 */
export function refusalForNoProfile(profileNames: readonly string[]): CategorizedCliError {
  if (profileNames.length > 0) {
    return new CategorizedCliError(
      "not-authenticated",
      "CLI_NOT_AUTHENTICATED",
      `No active profile set. Available: ${profileNames.join(", ")}.`,
      "Run: nexus auth switch <profile>"
    );
  }

  return new CategorizedCliError(
    "not-authenticated",
    "CLI_NOT_AUTHENTICATED",
    "No profiles configured.",
    "Run: nexus auth login"
  );
}
