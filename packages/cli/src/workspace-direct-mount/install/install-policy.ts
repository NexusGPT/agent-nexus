/**
 * What the user said, before the question was asked, about installing a
 * missing prerequisite (rclone, or FUSE-T on macOS).
 *
 *   `--install-deps`      → "install"  run without asking
 *   `--no-install-deps`   → "never"    never offer; refuse and print the commands, as before
 *   neither               → "ask"      ask at a terminal; with no terminal, refuse
 *
 * Commander gives the pair as ONE option value: `--install-deps` sets it true,
 * `--no-install-deps` sets it false, and neither leaves it undefined. That is
 * what `policyFrom` narrows, once, at the command's edge. Not `--yes`: the CLI
 * surface classifies every command declaring `--yes` as destructive.
 */
export const INSTALL_POLICIES = ["ask", "install", "never"] as const;
export type InstallPolicy = (typeof INSTALL_POLICIES)[number];

export function policyFrom(installDeps: boolean | undefined): InstallPolicy {
  if (installDeps === true) return "install";
  if (installDeps === false) return "never";
  return "ask";
}

/**
 * What the CLI does with an install plan it has just built. A refusal carries
 * why, because the two reasons owe the user different sentences: "you said
 * never, here are the commands" is not "there is no terminal to ask; pass
 * --install-deps in a script".
 *
 * 🚨 NOWHERE TO ASK AND NO EXPLICIT FLAG MEANS REFUSE. Having nobody to ask is
 * the one condition that guarantees nobody is watching; downloading a binary
 * and running sudo there is not what "ask" meant. Only a typed `--install-deps`
 * runs without a person. Same rule as `util/confirm.ts`, and the same test:
 * `--json` at a terminal still asks, a piped stdin never does, and neither does
 * a run whose question would land in a redirected file.
 *
 * ⚠️ `because: "no-tty"` IS THE UNION OF TWO CAUSES, AND THAT IS A DELIBERATE
 * CUT RATHER THAN AN OVERSIGHT. No terminal at all, and a terminal with both
 * outputs redirected, are different situations; `noTtyHint`'s "No terminal to
 * ask" is true of the first and imprecise about the second, where the operator
 * is sitting at one. It is kept as one value because nothing reads this field
 * except the `=== "never"` test in `rclone-readiness.ts`, and the REMEDY the
 * hint prints — `--install-deps`, or the manual commands — is the right remedy
 * for both. Splitting the sentence means threading a cause through
 * `noTtyHint`/`nothingToInstall`, which buys a more exact noun and no different
 * action.
 */
export type InstallDecision =
  | { readonly kind: "run" }
  | { readonly kind: "ask" }
  | { readonly kind: "refuse"; readonly because: "never" | "no-tty" };

/**
 * `canAsk` is `DepsIo.canAsk` — BOTH halves of the conversation, never
 * `stdinIsTTY`, which is the sibling field `installPlanFor` needs for `sudo`.
 * The parameter is named for what it has to mean here, so a caller passing the
 * other one reads as wrong at the call site.
 */
export function installDecision(policy: InstallPolicy, canAsk: boolean): InstallDecision {
  switch (policy) {
    case "install":
      return { kind: "run" };
    case "never":
      return { kind: "refuse", because: "never" };
    case "ask":
      return canAsk ? { kind: "ask" } : { kind: "refuse", because: "no-tty" };
    default:
      return policy satisfies never;
  }
}
