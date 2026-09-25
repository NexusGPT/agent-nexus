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
 * 🚨 NO TERMINAL AND NO EXPLICIT FLAG MEANS REFUSE. The absence of a terminal
 * is the one condition that guarantees nobody is watching; downloading a
 * binary and running sudo there is not what "ask" meant. Only a typed
 * `--install-deps` runs without a person. Same rule as `util/confirm.ts`,
 * decided on STDIN: `--json` at a terminal still asks, and a piped stdin never
 * does.
 */
export type InstallDecision =
  | { readonly kind: "run" }
  | { readonly kind: "ask" }
  | { readonly kind: "refuse"; readonly because: "never" | "no-tty" };

export function installDecision(policy: InstallPolicy, stdinIsTTY: boolean): InstallDecision {
  switch (policy) {
    case "install":
      return { kind: "run" };
    case "never":
      return { kind: "refuse", because: "never" };
    case "ask":
      return stdinIsTTY ? { kind: "ask" } : { kind: "refuse", because: "no-tty" };
    default:
      return policy satisfies never;
  }
}
