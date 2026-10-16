/**
 * The gate's finding type, and the shadows that are DECLARED deliberate.
 *
 * The exception key is `${commandPath} ${flag}` — the two fields of
 * {@link ShadowedOption} and nothing else — so the type and the ledger belong
 * in one leaf: a change to either has to be a change to both.
 *
 * ── When merging is right, and when renaming is the only repair ──────────────
 *
 * Merge the global (`auth login`) only when the two options mean THE SAME
 * THING — there, both `--api-key` values are "a Nexus API key", so taking the
 * global's value is correct.
 *
 * RENAME (`custom-model`) when they mean DIFFERENT things. `--base-url` on the
 * root is the Nexus API; on `custom-model create` it was a third party's
 * inference endpoint. Merging those would have hard-wired the exposure instead
 * of removing it.
 */

export interface ShadowedOption {
  /** Space-joined command path, e.g. `custom-model create`. */
  commandPath: string;
  /** The colliding long flag, e.g. `--api-key`. */
  flag: string;
}

/** `<command path> <flag>` → why the shadow is deliberate and how it is handled. */
export const SHADOWED_OPTION_EXCEPTIONS: Readonly<Record<string, string>> = {
  "auth login --api-key":
    "Same meaning as the global: both are a Nexus API key. The action merges " +
    "`command.optsWithGlobals()` over its own opts, so the user's value is read " +
    "from whichever slot commander filled.",
  "auth login --profile":
    "Same meaning as the global: both name a profile. Recovered by the same " +
    "`optsWithGlobals()` merge in the action."
};

/** Shadows that carry no entry in {@link SHADOWED_OPTION_EXCEPTIONS}. */
export function undeclaredShadowedOptions(shadows: readonly ShadowedOption[]): ShadowedOption[] {
  return shadows.filter((s) => !(`${s.commandPath} ${s.flag}` in SHADOWED_OPTION_EXCEPTIONS));
}
