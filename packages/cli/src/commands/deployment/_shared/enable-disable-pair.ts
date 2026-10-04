/**
 * A SETTING TURNED ON BY `--enable-<x>` AND OFF BY `--no-<x>` LANDS ON TWO
 * SEPARATE COMMANDER KEYS, AND READING ONLY ONE OF THEM IS SILENT.
 *
 * Commander derives an option key from that option's OWN long name. So
 * `--enable-multi-language` writes `opts.enableMultiLanguage` and
 * `--no-multi-language` writes `opts.multiLanguage` — two flags for one
 * setting, on two keys that never meet. `deployment template update` read only
 * the first, so both negative flags parsed, were accepted, contributed NOTHING
 * to the request body, and the command still printed `Deployment template
 * updated.` over an unchanged setting.
 *
 * ── Why `=== false` and never a bare forward ─────────────────────────────────
 *
 * A `--no-x` flag declared with no positive twin ON ITS OWN KEY carries
 * commander's implicit default `true`. Forwarding `opts.multiLanguage` as-is
 * would therefore write `enableMultiLanguage: true` into every body that never
 * named the flag, turning the setting ON for an operator who only meant to
 * rename a template. That is the same defect one layer up, and it would pass a
 * test that only checked the negative case.
 *
 * ── Why both flags together is a REFUSAL, not a precedence rule ──────────────
 *
 * Two keys means commander records no ordering between them, so there is no
 * last-one-wins to read and any winner this file picked would be a guess about
 * what the operator meant. `util/boolean-flag.ts` is the house precedent: a
 * boolean surface here refuses what it cannot understand rather than coercing.
 */
export type EnableDisablePair =
  | { readonly contradiction: true }
  | { readonly contradiction: false; readonly value: boolean | undefined };

export function readEnableDisablePair(enabled: unknown, notDisabled: unknown): EnableDisablePair {
  const turnedOn = enabled === true;
  const turnedOff = notDisabled === false;

  if (turnedOn && turnedOff) return { contradiction: true };
  if (turnedOn) return { contradiction: false, value: true };
  if (turnedOff) return { contradiction: false, value: false };
  return { contradiction: false, value: undefined };
}

/** The hint both contradiction refusals share, so they cannot drift apart. */
export const CONTRADICTORY_TOGGLE_HINT =
  "Send one of the two. They land on separate commander keys, so there is no " +
  "last-one-wins order to read and this command will not guess which you meant.";
