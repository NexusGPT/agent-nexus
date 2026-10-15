import { reportFailure } from "../../errors";
import { color, printSuccess } from "../../output";
import { formatResolutionList, judgeResolution } from "../../util/resolve-on-path";
import { compareSemver } from "../../util/version-check";
import { EXIT_INSTALLED_BUT_NOT_RESOLVED } from "./_shared/constants";
import type { UpgradeEnvironment } from "./_shared/environment";
import { reportShadowed } from "./report-shadowed";
import { reportUnreadable } from "./report-unreadable";
import { reportUnresolved } from "./report-unresolved";
import { reportVerified } from "./report-verified";

/**
 * The install exited 0. Say what that is worth by reading the machine back.
 *
 * The four outcomes share one opening sentence — "Installed <pkg>@<v>" — because
 * that is the only fact the install itself established. What follows is read
 * from the PATH, not inferred from the exit code.
 */
function reportVerification(env: UpgradeEnvironment, latest: string, installCmd: string): void {
  const candidates = env.resolve();
  const verdict = judgeResolution(latest, candidates);
  const installedWith = `Installed with: ${installCmd}`;
  const elevated = env.elevatedBy;

  if (verdict.kind === "verified") {
    reportVerified(env, latest, installCmd, verdict);
    return;
  }

  process.exitCode = EXIT_INSTALLED_BUT_NOT_RESOLVED;

  if (verdict.kind === "unresolved") {
    reportUnresolved(elevated, latest, installedWith);
    return;
  }

  const list = formatResolutionList(candidates);

  if (verdict.kind === "unreadable") {
    reportUnreadable(elevated, latest, installedWith, list, verdict);
    return;
  }

  reportShadowed(elevated, latest, installedWith, list, verdict);
}

/**
 * Check, install, then VERIFY — and never claim the third from the second.
 *
 * The old body ended at `execSync(...)` followed by "Successfully upgraded".
 * Every sentence after the install is now a statement about something that was
 * re-read, and the one case where nothing can be re-read says so instead of
 * borrowing the success message.
 */
export async function runUpgrade(env: UpgradeEnvironment): Promise<void> {
  const { currentVersion } = env;

  process.stderr.write(`Current version: ${color.cyan(currentVersion)}\n`);
  process.stderr.write("Checking for updates…\n");

  const latest = await env.fetchLatest();

  if (!latest) {
    // One command under four spellings — `upgrade` and the three aliases — and
    // every one of them failed with an empty stdout under --json. The roster is
    // the authority and `upgrade-verifies-what-it-claims.test.ts` counts it.
    process.exitCode = reportFailure(
      "connection-failed",
      "Failed to check for updates.",
      "The npm registry was unreachable. Check your network and try again."
    );
    return;
  }

  if (compareSemver(currentVersion, latest) >= 0) {
    printSuccess(`Already up-to-date (${currentVersion}).`, { version: currentVersion });
    return;
  }

  process.stderr.write(`Upgrading ${color.yellow(currentVersion)} → ${color.green(latest)}…\n`);

  if (env.elevatedBy !== null) {
    // Before the install, not after: the reader can still cancel, and the
    // sentence is about what the install is ABOUT TO DO rather than about a
    // result. It goes to stderr so `--json` still emits exactly one document.
    process.stderr.write(
      `${color.yellow("Running under sudo.")} The install runs as root, so it writes root's\n` +
        `global prefix rather than ${env.elevatedBy}'s — and the check afterwards can only read\n` +
        `root's environment. Run it WITHOUT sudo unless your global prefix needs root.\n`
    );
  }

  const installCmd = env.installCommand();

  try {
    env.install(installCmd);
  } catch {
    process.exitCode = reportFailure(
      "local-failed",
      "Upgrade failed.",
      `Try running manually: ${installCmd}`
    );
    return;
  }

  reportVerification(env, latest, installCmd);
}
