import type { Command } from "commander";

import { getProfile, listProfiles, setActiveProfile } from "../../config";
import { refuse, reportFailure } from "../../errors";
import { color, isJsonMode, printSuccess } from "../../output";
import { switchHere } from "./switch.here";
import { switchSession } from "./switch.session";
import { switchIsShadowed } from "./switch.shadowed";

const SWITCH_HELP = `
Examples:
  $ nexus auth switch work
  $ nexus auth switch work --here
  $ eval "$(nexus auth switch work --session)"

Notes:
  THE DEFAULT SWITCH IS MACHINE-WIDE, NOT PER-TERMINAL. It rewrites one value in
  ~/.nexus-mcp/config.json that EVERY process on this machine reads, so it also
  repoints every other shell, editor and agent session that has no binding of its
  own — including long-running ones already mid-task. Two sessions working on two
  organizations cannot both use it: the last switch wins for both, and the loser
  gets no signal, so its next write lands in the other organization (NEX-2525).
  --here and --session are the per-folder and per-shell scopes that CAN be held
  concurrently:
    --here     writes {"profile":"<name>"} to ./.nexusrc — this directory and its
               subdirectories, in every shell, until "nexus auth unpin". Same file
               as "nexus auth pin", and re-running it MOVES an existing pin.
    --session  writes NOTHING. It prints one line, "export NEXUS_PROFILE=<name>",
               for you to eval; the binding then lives in that shell's environment
               and dies with it. Not eval'd, it does nothing — the printed line is
               the whole effect. POSIX syntax; in fish use "set -gx NEXUS_PROFILE
               <name>", and --json carries the raw name for any other shell.
  SWITCHING IS NOT THE SAME AS WINNING. This changes which profile "active"
  resolves to, and three things outrank active and PERSIST across processes:
  NEXUS_API_KEY, NEXUS_PROFILE, and a .nexusrc pin in the working directory. Any
  of them still decides what the NEXT command uses.
  So this command predicts what the next process will resolve to and REFUSES to
  be silent about a mismatch: it warns and EXITS NON-ZERO, which is what stops
  "nexus auth switch org-b && nexus workspace mount" running the second half
  against the wrong organization.
  The prediction deliberately ignores --api-key and --profile given on THIS
  invocation, because those are ephemeral and do not carry into the next process.
  Clear a .nexusrc pin with "nexus auth unpin"; the two environment variables are
  yours to unset.
  Full precedence, highest first: --api-key > --profile > NEXUS_API_KEY >
  NEXUS_PROFILE (--session) > .nexusrc (--here) > active profile (plain switch) >
  the profile named "default". An explicit --profile outranks an exported
  NEXUS_API_KEY; nothing else does.`;

/** `nexus auth switch` */
export function registerAuthSwitchCommand(auth: Command, _program: Command): Command {
  const leaf = auth
    .command("switch")
    .description("Switch the active profile — machine-wide, or scoped to this folder or shell")
    .argument("<name>", "Profile name to activate")
    .option(
      "--here",
      "Scope the switch to THIS DIRECTORY (writes .nexusrc); the machine-wide active profile is left alone"
    )
    .option(
      "--session",
      "Scope the switch to THIS SHELL: print the export line to eval; writes nothing at all"
    )
    .addHelpText("after", SWITCH_HELP)
    .action((name: string, opts: { here?: boolean; session?: boolean }) => {
      // Two scopes, and the whole point of them is that they are DIFFERENT
      // places. Silently applying one would leave the other unwritten under a
      // command line that asked for it.
      if (opts.here && opts.session) {
        process.exitCode = refuse(
          "--here and --session are two different scopes; pass one.",
          "--here writes ./.nexusrc; --session prints an export line for this shell."
        );
        return;
      }

      if (opts.here) {
        switchHere(name);
        return;
      }
      if (opts.session) {
        switchSession(name);
        return;
      }

      try {
        setActiveProfile(name);
      } catch (err) {
        process.exitCode = reportFailure("local-failed", (err as Error).message);
        return;
      }

      const profile = getProfile(name);
      const orgPart = profile?.orgName ? ` (${profile.orgName})` : "";
      printSuccess(`Switched to "${name}"${orgPart}.`);

      // Say out loud that this reached every other session. The command reads as
      // "switch MY profile" and is not: with more than one profile saved there is
      // something to clobber, and the sessions it clobbers print nothing at all.
      if (!isJsonMode() && Object.keys(listProfiles().profiles).length > 1) {
        console.log(
          color.dim(
            "\n  Machine-wide: every other shell without its own binding now resolves to " +
              `"${name}" too.` +
              `\n  Scope it instead: nexus auth switch ${name} --here (this folder) · ` +
              `--session (this shell)`
          )
        );
      }

      if (switchIsShadowed(name)) process.exitCode = 1;
    });
  return leaf;
}
