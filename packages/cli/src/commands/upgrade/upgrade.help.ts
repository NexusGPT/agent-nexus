/**
 * `nexus upgrade --help`, the hand-written half.
 *
 * A module-level const rather than a template literal inside the registrar —
 * this package's pattern for a multi-kilobyte help block, so the registrar
 * reads as wiring and the prose is editable without scrolling past it.
 *
 * ⚠️ IT IS THE ONLY PLACE ALL FOUR SPELLINGS ARE WRITTEN DOWN FOR A READER.
 * Commander renders only the first alias in a usage line, so `latest` and `up`
 * appear nowhere else on the surface. See `_shared/constants.ts` →
 * `UPGRADE_ALIASES` for why that list is closed.
 */
export const UPGRADE_HELP = `
Examples:
  $ nexus upgrade

Notes:
  IT ANSWERS TO FOUR SPELLINGS: "upgrade", "update", "latest" and "up". The usage
  line above shows only the first alias, so this is the one place all four are
  written down. Nothing else upgrades the CLI — a word that is not on this list
  is not a spelling of this command.

  IT NEEDS NO API KEY, NO BASE URL AND NO PROFILE. Unlike every resource command
  group, this one does not call the Public API — it manages your local CLI
  install and touches nothing in your workspace. An unauthenticated or
  logged-out machine can upgrade normally.

  IT RUNS A GLOBAL PACKAGE-MANAGER INSTALL AS YOU. The manager is inferred from
  where the running binary actually lives — pnpm, yarn, otherwise npm — and the
  install runs with your permissions and no elevation. If your global prefix
  needs root, the install fails rather than prompting; the error prints the
  exact command, so re-run that one yourself with whatever privilege it needs.

  🚨 DO NOT RUN THIS UNDER sudo UNLESS YOUR GLOBAL PREFIX GENUINELY NEEDS ROOT.
  Elevated, the install writes ROOT's global prefix rather than yours, and the
  verification below can only read ROOT's environment — so a match proves
  nothing about the shell you will type "nexus" into next. That combination is
  what produces the loop where every run reports a successful upgrade and the
  version never moves. This command now detects sudo, warns before installing,
  and REFUSES to report an upgrade it verified for somebody else: exit 11, with
  the one command that settles it.

  IT IS A NO-OP WHEN YOU ARE CURRENT. The version is checked first, and an
  already-current CLI prints its version and exits 0 without installing
  anything, so this is safe to run repeatedly and safe to put in a script.

  IT VERIFIES THE INSTALL BY RE-READING YOUR PATH, AND SUCCESS IS ONLY CLAIMED
  WHEN THAT AGREES. After the install it resolves "nexus" the way a shell does
  and asks that binary its version. Only a match prints "Upgraded"; anything
  else names what happened instead and prints EVERY "nexus" on your PATH in
  search order, because the entry that shadows the new one is never the first
  one "which nexus" shows you.

  A CLI THAT DID NOT COME FROM A GLOBAL INSTALL IS NOT UPGRADABLE HERE. Run
  through npx, vendored into a repo, or installed as a project dependency, this
  installs a SEPARATE global copy rather than replacing the one you invoked —
  so the next run of your local binary is still the old version. Upgrade those
  through whatever installed them. That case is now named as its own outcome
  instead of being reported as a successful upgrade.

THE EXIT CODES, AND EVERY NON-ZERO ONE MEANS SOMETHING DIFFERENT.
    0  You are on the latest version, and that was read back, not assumed.
    1, 7, 9  NOTHING CHANGED — the registry was unreachable (7), the install
       command failed (9), or something else went wrong (1). Retrying is
       reasonable. See "nexus --help" for the full exit-code table.

    🔴 ALL FOUR NON-ZERO CODES MOVED. This command used to answer 1 for both
    "registry unreachable" and "install failed", 2 for the PATH finding and 3
    for the unmeasured one. They are now 7, 9, 10 and 11. A script branching on
    1, 2 or 3 from THIS command must be updated — nothing here still exits 1
    except a failure with no more specific category.
    10 The install SUCCEEDED and the shell still resolves a different copy.
       Nothing about that PATH changed, so RETRYING WILL NOT HELP; the output
       names the file that wins and what to do about it.
    11 The install SUCCEEDED and it could not be checked FOR YOU — this ran
       under sudo, so the check read root's environment. That is an ABSENT
       measurement, not a failed one: nothing here says your PATH is wrong.
       Re-running under sudo gives the same non-answer; run "nexus --version"
       without sudo.

    🔴 THESE TWO MOVED. They were 2 and 3, which the rest of the binary spends
    on "not authenticated" and "permission denied". A script branching on 2 or 3
    here must be updated.`;
