import { type ResolvedProfile, resolveProfile } from "../../config";
import { printWarning } from "../../output";

/**
 * Wrong-org guard (NEX-2361): switching a profile only changes what ONE level of
 * the resolution chain picks. A higher-precedence selector that PERSISTS across
 * processes — NEXUS_API_KEY (override), NEXUS_PROFILE, or a `.nexusrc` pin —
 * still wins, so a subsequent command keeps using THAT credential, not the one
 * just switched to. Left silent, `auth switch org-b && workspace mount` would
 * operate on the override's org while the user believes they're on org B. Detect
 * the mismatch, warn loudly, and exit non-zero so the dangerous `&&` chain halts.
 *
 * Resolve with NO opts: we're predicting what the NEXT process resolves to, and
 * the ephemeral --api-key / --profile flags on THIS invocation do not carry over
 * to it. Forwarding them would falsely flag `nexus --api-key X auth switch org-b
 * && nexus workspace mount`, whose second (flag-less) command correctly resolves
 * to org-b.
 *
 * Shared by the machine-wide switch and `--here`: both change what a later
 * process resolves to, and both can be shadowed by the same three selectors. It
 * does NOT serve `--session`, whose binding is not in this process's environment
 * yet and so cannot be predicted by resolving it.
 *
 * It WARNS but does not exit: the caller sets `process.exitCode`, in the scope
 * that already put the success document on stdout. Setting it here instead puts
 * a prose-only refusal in a scope with no document, which is the shape
 * `json-error-document.static-scan` reports — and it would be right to, because
 * from inside this function nothing can tell that stdout was already served.
 */
export function switchIsShadowed(name: string): boolean {
  let effective: ResolvedProfile | undefined;
  try {
    effective = resolveProfile();
  } catch {
    // No resolvable profile (shouldn't happen right after a successful switch) —
    // nothing to compare against, so skip the guard.
    effective = undefined;
  }
  if (!effective) return false;

  // An "override" source means the NEXUS_API_KEY env credential wins; its name
  // is the literal sentinel "override", NOT a real profile identity, so we must
  // warn even when the just-switched profile is itself named "override" (a legal
  // profile name) — the env key still shadows it. For NEXUS_PROFILE / .nexusrc
  // the name IS a real profile, so a true match means the switch is effective and
  // no warning is needed.
  if (effective.source === "override" || effective.name !== name) {
    warnSwitchIneffective(name, effective);
    return true;
  }
  return false;
}

/**
 * Warn that a just-completed `auth switch` will NOT take effect because a
 * higher-precedence selector resolves to a different credential. The message is
 * tailored to the winning source so the user knows exactly what to unset.
 */
function warnSwitchIneffective(switchedTo: string, effective: ResolvedProfile): void {
  // Resolution runs with no ephemeral flags, so an "override" source here can
  // only come from the persistent NEXUS_API_KEY env var.
  if (effective.source === "override") {
    printWarning(
      `NEXUS_API_KEY is set — the switched profile will NOT take effect.`,
      `Unset it (unset NEXUS_API_KEY), or pass --profile ${switchedTo} per command.`,
      `Commands keep using the NEXUS_API_KEY credential until then.`
    );
    return;
  }

  if (effective.source === "env") {
    printWarning(
      `NEXUS_PROFILE="${effective.name}" overrides the active profile — the switch will NOT take effect.`,
      `Rebind this shell: eval "$(nexus auth switch ${switchedTo} --session)"`,
      `Or unset it (unset NEXUS_PROFILE), or pass --profile ${switchedTo} per command.`,
      `Commands keep using profile "${effective.name}" until then.`
    );
    return;
  }

  if (effective.source === "directory") {
    printWarning(
      `This directory is pinned to "${effective.name}" via .nexusrc — the switch will NOT take effect here.`,
      `Move the pin: nexus auth switch ${switchedTo} --here`,
      `Or run "nexus auth unpin", or pass --profile ${switchedTo} per command.`,
      `Commands in this directory keep using profile "${effective.name}" until then.`
    );
    return;
  }

  // Fallback for any other unexpected mismatch.
  printWarning(
    `The switch may NOT take effect — commands resolve to profile "${effective.name}", not "${switchedTo}".`,
    `Pass --profile ${switchedTo} per command to be explicit.`
  );
}
