import type { Command } from "commander";

import { runStatus } from "./status.handler";

const STATUS_HELP = `
Examples:
  $ nexus auth status

Notes:
  Shows profile resolution: --profile flag > NEXUS_PROFILE env > .nexusrc > active > "default".
  Use "nexus auth pin <profile>" to pin a directory to a profile via .nexusrc.

  THE ORG LINE IS A SECOND, SEPARATE RESOLUTION and it does not follow the
  profile. A cross-org token acts on whichever organization the
  organization-id header names: NEXUS_ORGANIZATION_ID if this shell exports one,
  otherwise the orgId stored on the profile. --json reports which as "orgSource"
  (env | profile | token); the human line marks the env case in place. Under the
  env case the stored organization NAME is withheld rather than shown, because it
  belongs to the profile's organization, not the one selected — a name beside the
  wrong id is worse than no name.

  A SIXTH SOURCE SITS ABOVE ALL FIVE: an explicit --api-key flag or a
  NEXUS_API_KEY environment variable. Either one overrides the resolved
  profile's key entirely and writes no profile of its own — this command reports
  it as "override". That is the case to look for when the key in use is not the
  key the named profile holds.

  IT VERIFIES THE KEY AGAINST THE API AND EXITS NON-ZERO WHEN THE KEY IS BAD.
  Exit 0 from this command means the key authenticated against the base URL
  reported on the "api:" line, at the moment it ran. Five failures and four
  codes — the code names the family, the message names which one it was:

    2  no profile, or the profile stores no key   -> nexus auth login
    2  the server read the key and refused it     -> nexus auth login
    7  the API could not be reached at all        -> check your network
    8  the check ran out of time                  -> raise --timeout
    6  the server was reached and errored         -> try again

  ⚠️ 7, 8 and 6 mean THE CREDENTIAL WAS NOT JUDGED. They are not a verdict that
  the key is bad, and treating them as one sends you to replace a key that may
  be fine.

  --no-verify skips the call and reports local configuration only. It exits 0
  whatever the key's real state is, and says so: the JSON "verified" field is
  null rather than true, because a check nobody ran is neither pass nor fail.
  Use it offline, or to inspect a profile for a host you cannot reach.

  "nexus auth whoami" answers a different question — WHO the key is, live, with
  the organization and user resolved from the API and cached back into the
  profile. Both verify; only whoami reports and refreshes the identity.`;

/** `nexus auth status` */
export function registerAuthStatusCommand(auth: Command, program: Command): Command {
  const leaf = auth
    .command("status")
    .description("Verify the resolved profile's key against the API")
    .option(
      "--no-verify",
      "Skip the live check and report local configuration only (reports verified: null)"
    )
    .addHelpText("after", STATUS_HELP)
    .action(async (options: { verify: boolean }) => {
      await runStatus(options, program);
    });
  return leaf;
}
