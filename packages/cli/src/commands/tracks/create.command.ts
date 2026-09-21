import type { TrackNextOwner } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { absent, printSuccess } from "../../output";
import { TRACK_CREATE__BODY_NEXT_OWNER, TRACK_CREATE_CONTRACT } from "../tracks.contract.generated";

const CREATE_HELP = `
Examples:
  $ nexus tracks create --slug billing-rewrite --title "Billing rewrite"
  $ nexus tracks create --slug onboarding --title "Onboarding" \\
      --current-step "waiting on the design review" --next-owner USER
  $ nexus tracks create --slug agent-loop --title "Agent loop" --next-owner CUE --json

Notes:
  THE NUMBER IS ALLOCATED BY THE SERVER AND THERE IS NO FLAG FOR IT. It comes
  from a per-organization sequence inside the same transaction that inserts the
  row, so it runs from 1, never repeats and never gaps. Read it off the output.
  THE SLUG IS UNIQUE PER ORGANIZATION, and a duplicate is a 409. It is the
  human name for the track; nothing addresses a track by slug yet, so pick one
  a person can read rather than one a script will parse.
  A NEW TRACK IS PLANNED AND EMPTY, AND IT ALREADY SATISFIES THE READY
  PREDICATE. "nexus tracks ready" tests status, archival and dependency edges
  and never tasks, so nothing has to be added before a track qualifies. It has no
  sections until you run "nexus tracks section create".
  SATISFYING THAT PREDICATE IS NOT THE SAME AS BEING ON THE PAGE, and for a
  track you just made the two come apart in the worst direction. The number is
  allocated ascending and "nexus tracks ready" is ordered by number ascending
  with a server-side default of 50 rows, so the track you just created is the
  LAST in line: on an organization already holding 50 ready tracks it is not on
  the first page at all. Read it back by id with "nexus tracks get", or widen
  the page with --limit.
  --next-owner SAYS WHO IS WAITED ON, NOT WHO OWNS THE TRACK. CUE means an
  agent can proceed, USER means a person has to act, EVENT means something
  outside has to happen first.
  --short-title IS CURATED AND THE SERVER NEVER DERIVES ONE. Omit it and the
  track's shortTitle is null, which every reader renders as the full --title.
  It is refused above 5 words or 80 characters rather than truncated, because
  no truncation rule can turn an arbitrary title into a five-WORD name. There
  is no route that sets it later, so this is the only place to write one.
  Needs the "tracks:write" scope.`;

/** `nexus tracks create` */
export function registerTracksCreateCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("create")
    .description("Create one track")
    .requiredOption(
      "--slug <slug>",
      "1-64 chars of [a-z0-9-], starting with a letter or digit. Unique in your organization"
    )
    .requiredOption("--title <title>", "What the track is called")
    .option(
      "--short-title <text>",
      "A short name, at most 5 words and 80 characters. Omitted leaves it uncurated"
    )
    .option("--current-step <text>", "What happens next, one line, at most 400 characters")
    .addOption(
      enumOption(
        "--next-owner <owner>",
        "Who is waited on. USER when omitted",
        TRACK_CREATE__BODY_NEXT_OWNER
      )
    )
    .addHelpText("after", CREATE_HELP)
    .action(
      async (opts: {
        slug: string;
        title: string;
        shortTitle?: string;
        currentStep?: string;
        nextOwner?: string;
      }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const track = await client.tracks.create({
            slug: opts.slug,
            title: opts.title,
            ...(opts.shortTitle !== undefined && { shortTitle: opts.shortTitle }),
            ...(opts.currentStep !== undefined && { currentStep: opts.currentStep }),
            ...(opts.nextOwner !== undefined && {
              nextOwner: opts.nextOwner as TrackNextOwner
            })
          });

          printSuccess("Track created.", {
            id: track.id,
            number: track.number,
            slug: track.slug,
            title: track.title,
            // The STORED value, so a caller that passed --short-title can see it
            // landed rather than assume it. `absent()` and not `?? "(none)"`:
            // this one object goes down both channels, so a display string here
            // would replace the null a script reads.
            shortTitle: track.shortTitle ?? absent("(none — readers show the title)")
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(leaf, TRACK_CREATE_CONTRACT);
  return leaf;
}
