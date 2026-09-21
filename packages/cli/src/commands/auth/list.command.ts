import type { Command } from "commander";

import { listProfiles } from "../../config";
import { color, isJsonMode, printTable } from "../../output";

const LIST_HELP = `
Examples:
  $ nexus auth list
  $ nexus auth list --json

Notes:
  The ▸ marker is the ACTIVE profile, which is not necessarily the credential the
  next command uses — NEXUS_API_KEY, NEXUS_PROFILE and a .nexusrc pin all outrank
  it. "nexus auth whoami" resolves the one that actually wins.
  A row shows the profile name, its organization and its base URL. A profile with
  no stored baseUrl is listed against the default, https://api.nexusgpt.io, so
  that column is never blank and never proves the value was set explicitly.
  EMPTY ANSWERS DIFFERENTLY IN THE TWO MODES. With no profiles saved, --json is
  \`[]\` and the plain form is a human sentence pointing at "nexus auth login" —
  so parse the JSON, never the prose.

  --json IS A BARE ARRAY AND THE ACTIVE PROFILE IS FLAGGED BY A GLYPH, NOT A
  BOOLEAN. There is no envelope and no meta — the rows are the whole document,
  each one {marker, name, orgName, baseUrl}. "marker" is the ▸ from the table,
  and it is a single SPACE on every other row, so test it against "▸" rather
  than for truthiness: " " is a non-empty string and every row would match.

    $ nexus auth list --json | jq -r '.[] | select(.marker == "▸") | .name'

  That reads the ACTIVE profile, which is still not necessarily the one the next
  command uses — see the first note. "nexus auth whoami" resolves that one.`;

/** `nexus auth list` */
export function registerAuthListCommand(auth: Command, _program: Command): Command {
  const leaf = auth
    .command("list")
    .description("List all saved profiles")
    .addHelpText("after", LIST_HELP)
    .action(() => {
      const { profiles, activeProfile } = listProfiles();
      const names = Object.keys(profiles);

      // The hint is HUMAN copy. Under --json an empty account is `[]`, which is
      // what every other list command answers and what a script can act on; the
      // sentence was unparseable prose and the only thing on stdout.
      if (names.length === 0 && !isJsonMode()) {
        console.log(color.dim("No profiles. Run: nexus auth login"));
        return;
      }

      const rows = names.map((name) => ({
        marker: name === activeProfile ? "▸" : " ",
        name,
        orgName: profiles[name].orgName ?? color.dim("—"),
        baseUrl: profiles[name].baseUrl ?? "https://api.nexusgpt.io"
      }));

      printTable(rows, [
        { key: "marker", label: " ", width: 2 },
        { key: "name", label: "PROFILE" },
        { key: "orgName", label: "ORGANIZATION" },
        { key: "baseUrl", label: "BASE URL" }
      ]);
    });
  return leaf;
}
