import { getProfile, validateProfileName } from "../../config";
import { refuse } from "../../errors";
import { color, isJsonMode, printSuccess, printWarning } from "../../output";
import { refuseUnknownProfile } from "./switch.refuse-unknown-profile";

/**
 * `auth switch <name> --session` — bind THIS SHELL, writing nothing anywhere.
 *
 * A process cannot set a variable in the shell that spawned it, so the binding
 * is DELIVERED rather than applied: one `export` line on stdout, meant for
 * `eval "$(...)"`. Everything else — the confirmation, any warning — goes to
 * stderr, because a single stray byte on stdout is evaluated as shell code.
 */
export function switchSession(name: string): void {
  const profile = getProfile(name);
  if (!profile) {
    process.exitCode = refuseUnknownProfile(name);
    return;
  }

  // The output of this one command is EXECUTED by the caller's shell, so the
  // name is re-validated against the same pattern `auth login` enforces before
  // it is interpolated. A profile name only reaches this branch by being in
  // config.json, which is a file a human can hand-edit — and shell-quoting a
  // value is a weaker guarantee than refusing to emit a name that never had to
  // be quoted in the first place.
  const invalid = validateProfileName(name);
  if (invalid) {
    process.exitCode = refuse(
      invalid,
      "This name cannot be emitted as shell code. Rename the profile, or use --here / --profile."
    );
    return;
  }

  const exportLine = `export NEXUS_PROFILE="${name}"`;
  const orgPart = profile.orgName ? ` (${profile.orgName})` : "";

  // NEXUS_PROFILE is the only selector this binding sets, and NEXUS_API_KEY
  // outranks it — an exported key would keep winning in the very shell the user
  // just bound. `switchIsShadowed` cannot see this: it resolves the CURRENT
  // environment, which does not have NEXUS_PROFILE set yet.
  //
  // Before the line rather than after it, and the line is still printed: the
  // user may be one `unset` away from meaning it, and a refusal that prints
  // nothing would cost them the command as well as the binding.
  if (process.env.NEXUS_API_KEY) {
    printWarning(
      "NEXUS_API_KEY is set in this shell — it outranks NEXUS_PROFILE, so this binding will NOT take effect.",
      "Unset it (unset NEXUS_API_KEY) in this shell, then eval the line again.",
      "Commands keep using the NEXUS_API_KEY credential until then."
    );
    process.exitCode = 1;
  }

  if (isJsonMode()) {
    printSuccess(`Eval the export line to bind this shell to "${name}"${orgPart}.`, {
      profile: name,
      scope: "session",
      variable: "NEXUS_PROFILE",
      value: name,
      exportLine
    });
  } else {
    // stdout: the line, alone. Anything else here lands inside the caller's eval.
    console.log(exportLine);
    process.stderr.write(
      color.dim(
        `  This shell → "${name}"${orgPart} once eval'd; nothing was written to disk.\n` +
          `  Run: eval "$(nexus auth switch ${name} --session)"\n`
      )
    );
  }
}
