import type { Command } from "commander";

import { clearConfig, listProfiles, removeProfile } from "../../config";
import { reportFailure } from "../../errors";
import { printSuccess } from "../../output";

const LOGOUT_HELP = `
Examples:
  $ nexus auth logout           # deletes active profile
  $ nexus auth logout work      # deletes "work" profile
  $ nexus auth logout --all     # deletes all profiles

Notes:
  logout fully deletes the profile entry from ~/.nexus-mcp/config.json —
  the stored API key AND its org metadata (orgName, orgId, baseUrl). This is
  a deletion, not a temporary sign-out. Run "nexus auth login" to re-create it.`;

/** `nexus auth logout` */
export function registerAuthLogoutCommand(auth: Command, _program: Command): Command {
  const leaf = auth
    .command("logout")
    .description("Delete a stored profile (API key + org metadata)")
    .argument("[name]", "Specific profile to delete (default: active profile)")
    .option("--all", "Delete all profiles")
    .addHelpText("after", LOGOUT_HELP)
    .action((name: string | undefined, opts: { all?: boolean }) => {
      if (opts.all) {
        clearConfig();
        printSuccess("Deleted all profiles. Run: nexus auth login to authenticate again.");
        return;
      }

      const { activeProfile, profiles } = listProfiles();
      const target = name ?? activeProfile;

      if (!target) {
        process.exitCode = reportFailure(
          "not-authenticated",
          "No active profile.",
          "Run: nexus auth login"
        );
        return;
      }

      if (!removeProfile(target)) {
        process.exitCode = reportFailure(
          "not-found",
          `Profile "${target}" not found.`,
          "Run: nexus auth list"
        );
        return;
      }

      const remaining = Object.keys(profiles).filter((p) => p !== target);

      if (remaining.length === 0) {
        printSuccess(
          `Deleted profile "${target}" (API key + org metadata removed). ` +
            `No profiles remaining. Run: nexus auth login`
        );
      } else {
        const { activeProfile: newActive } = listProfiles();
        printSuccess(`Deleted profile "${target}" (API key + org metadata removed).`, {
          remaining: remaining.join(", "),
          ...(newActive ? { active: newActive } : {})
        });
      }
    });
  return leaf;
}
