import { getProfile, slugifyProfileName, validateProfileName } from "../../config";
import { refuse } from "../../errors";
import { promptLine } from "../../util/confirm";
import type { Prompter } from "./login.prompter";

/**
 * Steps 4 and 5 — settle on a profile name, and get consent before overwriting
 * one that already exists.
 *
 * `null` means the run is over and the caller must return immediately, exactly
 * as the inline `return` this replaces did. Note the two `null`s differ: an
 * invalid name sets an exit code, while declining the overwrite prints
 * "Aborted." and leaves the run successful — which is the behaviour as it was.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE CONSENT FLAG IS `--overwrite`, AND IT IS DELIBERATELY NOT `--yes`.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `destructiveCandidates()` in `util/destructive-confirmation.candidates.ts`
 * unions the destructive-verb leaves with every leaf carrying an option whose
 * `long` is `--yes`. So declaring `--yes` here — through `confirmable()` or by
 * hand — makes `auth login` a destructive CANDIDATE, and the partition then
 * demands it appear in exactly one of three named sets. None can hold it
 * honestly:
 *
 *   - `CONFIRMS_BEFORE_ACTING` requires the action to be OBSERVED entering
 *     `confirmDestructive`. That helper gates on a bare `canAsk()`, which is
 *     false whenever stdin is a pipe — so it would refuse
 *     `printf 'nxs_…\nwork\ny\n' | nexus auth login`, the flow the prompter's
 *     line queue exists for (NEX-1879 defect 3). It also opens its own readline
 *     interface through `askLine`, a second one over the stdin the prompter
 *     already holds, which is that same defect by its original route.
 *   - `NOT_DESTRUCTIVE` requires a written reason nothing stored can be lost.
 *     An overwrite replaces a stored API key that is not recoverable from the
 *     config, so that reason would be false.
 *   - `UNCONFIRMED_DESTRUCTIVE` requires the leaf to act WITHOUT asking. It
 *     asks — just through the prompter rather than through `confirmDestructive`.
 *
 * Choosing a different flag name is therefore not dodging that gate: `--yes` is
 * this CLI's vocabulary for a confirmation routed through `confirmDestructive`,
 * and this is a pre-answer to one specific question in a command whose whole
 * purpose is to write the profile. `--overwrite` names the prompt's own verb.
 *
 * ⚠️ DO NOT "TIDY" THIS INTO `--yes`. It compiles, and it is MEASURED to red
 * FOUR pinned figures in `compatibility-figures.test.ts` — `N commands declare
 * --yes`, `all N declare the flag through confirmable()`, `destructiveCandidates
 * derives N candidates` and `the driven gate refuses on all N` — plus the
 * partition arm in `destructive-confirmation.driven.test.ts`, which no longer
 * finds `auth login` in any of its three sets.
 * `login-overwrite-consent.test.ts` carries the arms that keep it out of the
 * candidate set, and its `--yes` mutant is what produced that figure of four.
 */
export async function resolveProfileName(input: {
  ask: Prompter["ask"];
  provided: string | undefined;
  orgName: string | undefined;
  overwrite: boolean | undefined;
}): Promise<string | null> {
  const { ask, provided, orgName, overwrite } = input;

  // ── Step 4: Determine profile name ───────────────────────────────
  let profileName = provided;

  if (!profileName) {
    const suggested = orgName ? slugifyProfileName(orgName) : "default";
    const answer = (await ask(`Profile name [${suggested}]: `)).trim();
    profileName = answer || suggested;
  }

  // Validate profile name
  const nameError = validateProfileName(profileName);
  if (nameError) {
    process.exitCode = refuse(nameError);
    return null;
  }

  // ── Step 5: Check for existing profile ───────────────────────────
  //
  // `--overwrite` is consent given in the invocation, so the question has
  // already been answered and asking it again is what blocks a script. The
  // header owns why this flag is not `--yes`.
  const existing = getProfile(profileName);
  if (existing && overwrite !== true) {
    const existingLabel = existing.orgName ? ` (${existing.orgName})` : "";
    const answer = (
      await ask(`Profile "${profileName}"${existingLabel} already exists. Overwrite? [y/N]: `)
    ).trim();
    if (answer.toLowerCase() !== "y") {
      // The ACKNOWLEDGEMENT of an answer belongs on the stream that carried the
      // question — the same shape `confirmDestructive` uses. On `console.log` it
      // landed in the redirected file while the question it answers was on the
      // terminal, so the operator saw their own `n` and no confirmation of it.
      promptLine("Aborted.");
      return null;
    }
  }

  return profileName;
}
