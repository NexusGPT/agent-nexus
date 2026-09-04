import type {
  AppendTrackEventBody,
  ImportTrackPlanBody,
  TrackNextOwner,
  TrackStatus
} from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { absent, color, printEnvelope, printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, resolveRequiredBody } from "../util/body";
import { booleanFlag } from "../util/boolean-flag";
import { confirmable, confirmDestructive } from "../util/confirm";
import { explainUnreadyTasks, RECONSTRUCTION_CAVEAT } from "../util/track-blockers";
import { READY_SET_CEILING, renderWhyNotReady } from "../util/track-blockers.render";
import { trackListNextPageCommand } from "../util/track-list-next-page-command";
import {
  TRACK_APPEND_DIARY_ENTRY__BODY_KIND,
  TRACK_APPEND_DIARY_ENTRY_CONTRACT,
  TRACK_APPEND_EVENT_CONTRACT,
  TRACK_ARCHIVE_CONTRACT,
  TRACK_BEAT_AGENT_CONTRACT,
  TRACK_CLAIM_TASK_CONTRACT,
  TRACK_CLOSE_AGENT__BODY_STATE,
  TRACK_CLOSE_AGENT_CONTRACT,
  TRACK_CREATE__BODY_NEXT_OWNER,
  TRACK_CREATE_CONTRACT,
  TRACK_CREATE_DEPENDENCY_EDGE_CONTRACT,
  TRACK_CREATE_SECTION_CONTRACT,
  TRACK_CREATE_TASK_EDGE_CONTRACT,
  TRACK_DELETE_MEMORY_ENTRY_CONTRACT,
  TRACK_IMPORT_PLAN_CONTRACT,
  TRACK_LIST__PARAMS_ARCHIVED,
  TRACK_LIST__PARAMS_NEXT_OWNER,
  TRACK_LIST__PARAMS_STATUS,
  TRACK_LIST_AGENTS__PARAMS_STATE,
  TRACK_LIST_AGENTS_CONTRACT,
  TRACK_LIST_CONTRACT,
  TRACK_LIST_DIARY_ENTRIES__PARAMS_KIND,
  TRACK_LIST_DIARY_ENTRIES_CONTRACT,
  TRACK_LIST_EVENTS_CONTRACT,
  TRACK_LIST_MEMORY_ENTRIES_CONTRACT,
  TRACK_LIST_ORGANIZATION_EVENTS_CONTRACT,
  TRACK_LIST_READY_CONTRACT,
  TRACK_LIST_READY_TASKS_CONTRACT,
  TRACK_LIST_SECTIONS_CONTRACT,
  TRACK_LIST_TASK_EDGES_CONTRACT,
  TRACK_LIST_TASKS_CONTRACT,
  TRACK_OPEN_AGENT_CONTRACT,
  TRACK_PUT_MEMORY_ENTRY_CONTRACT,
  TRACK_READ_CONTRACT,
  TRACK_READ_ROLLUP_CONTRACT,
  TRACK_READ_TASK_CONTRACT,
  TRACK_RENAME_SECTION_CONTRACT,
  TRACK_SET_NEXT_OWNER__BODY_NEXT_OWNER,
  TRACK_SET_NEXT_OWNER_CONTRACT,
  TRACK_SET_STATUS__BODY_STATUS,
  TRACK_SET_STATUS_CONTRACT,
  TRACK_TOGGLE_TASK_CONTRACT,
  TRACK_UPDATE_CURRENT_STEP_CONTRACT
} from "./tracks.contract.generated";

/**
 * `nexus tracks …` — the Tracks namespace.
 *
 * ## The loop is four commands
 *
 * `tracks ready` -> `tracks task ready <trackId>` -> `tracks task get <taskId>`
 * -> `tracks task claim <taskId> --agent <agentId>`, then `tracks task toggle`
 * when it is done and `tracks diary append` for what happened.
 * `tracks agent beat` in between says the agent is still alive, and that
 * heartbeat is the ONE clock every collision banner's staleness is measured
 * from.
 *
 * ## Why `task claim` is special
 *
 * 🔴 THIS REGISTRATION IS THE SOURCE OF A GENERATED STRING, NOT JUST A COMMAND.
 * The collision banner every task read carries names a runnable command, and
 * that string is READ OFF THIS NODE by
 * `packages/cli/scripts/generate-track-banner-commands.ts` — the words come from
 * the parent chain, the placeholders from the argument and option declared here.
 * Nothing about the banner is typed by a person.
 *
 * So renaming `claim`, moving it under a different parent, or dropping `--agent`
 * BREAKS THE BUILD: the generator exits non-zero naming the action and
 * `track-banner-commands-name-a-real-command.test.ts` reds. That is the whole
 * mechanism — a banner naming a command the CLI does not register is an
 * instruction that fails in the reader's hands.
 *
 * ⚠️ `--agent` TAKES AN ID **OR** A NAME, AND ITS PLACEHOLDER STILL READS
 * `<agentId>` ON PURPOSE. The route resolves either — the name is unique among a
 * track's OPEN agents, and it is the value the banner's own "another agent is
 * working on this" line prints — so pasting a name out of the banner now works.
 * The placeholder is deliberately NOT renamed: it is read off this node into
 * `packages/types/src/shared/domain/tracks/track-banner-commands.generated.ts`
 * and printed inside every banner, and a rename would regenerate that plus three
 * other generated artefacts and red
 * `tracks-claim-help-names-the-agent-verb.test.ts`'s control — for a flag whose
 * ACCEPTED set widened while its wire field name did not move. What accepts more
 * needs no new spelling; the flag's DESCRIPTION and the notes below say so.
 *
 * ## There is no separate take-over verb, deliberately
 *
 * A claim on a task another agent already holds SUCCEEDS and overwrites.
 * `claimedByAgentId` is coordination, not access control — one credential per
 * organisation, no per-agent identity — so a refusal would enforce nothing and
 * would have to be recovered from. Claiming and taking over are one operation,
 * which is why both banner forms name this one command.
 */
export function registerTracksCommands(program: Command): void {
  const tracks = program.command("tracks").description("Work with tracks, their tasks and agents");

  // ── tracks create ─────────────────────────────────────────────────────────
  const create = tracks
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
    .addHelpText(
      "after",
      `
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
  Needs the "tracks:write" scope.`
    )
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
  bindCommand(create, TRACK_CREATE_CONTRACT);

  // ── tracks current-step ───────────────────────────────────────────────────
  const currentStep = tracks
    .command("current-step")
    .description("Set — or clear — what is happening on this track now")
    .argument("<trackId>", "The track to write the line on")
    .option("--text <text>", "The line, one sentence. What is happening right now")
    .option("--clear", "Clear the line instead of setting one")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks current-step 11111111-1111-4111-8111-111111111111 \\
      --text "waiting on the design review"
  $ nexus tracks current-step 11111111-1111-4111-8111-111111111111 --clear

Notes:
  EXACTLY ONE OF --text AND --clear. Neither is refused and both is refused,
  because an omitted --text meaning "clear it" is a footgun: a shell variable
  that expanded to nothing would silently wipe the line.
  THIS IS THE LINE "nexus tracks ready" PRINTS. It is what a person scanning
  the board reads first, and it is the only free-text field on the track that
  says what is happening rather than what the work IS.
  THE LINE IS AT MOST 400 CHARACTERS, and characters is the unit the database
  actually counts — the same limit "nexus tracks create --current-step" states.
  A WHITESPACE-ONLY LINE IS REFUSED. A line of only zero-width characters is not
  whitespace, so it is accepted and then renders as an empty line.
  THE LIMIT IS NOT CHECKED HERE. A longer line is refused by the server, so the
  number above is what you can rely on rather than what this command enforces.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist. That is deliberate — the two must not be distinguishable.
  Needs the "tracks:write" scope.`
    )
    .action(async (trackId: string, opts: { text?: string; clear?: boolean }) => {
      try {
        // Written as two named booleans rather than one clever comparison: this
        // guard is the only thing standing between a shell variable that
        // expanded to nothing and a silently wiped line.
        const clearing = opts.clear === true;
        const setting = opts.text !== undefined;
        if (clearing === setting) {
          process.exitCode = refuse("Pass exactly one of --text and --clear.");
          return;
        }

        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.updateCurrentStep(trackId, {
          currentStep: clearing ? null : (opts.text ?? null)
        });

        printSuccess(result.currentStep === null ? "Current step cleared." : "Current step set.", {
          trackId: result.trackId,
          currentStep: result.currentStep
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(currentStep, TRACK_UPDATE_CURRENT_STEP_CONTRACT);

  // ── tracks set-status ─────────────────────────────────────────────────────
  //
  // 🔴 `set-status` RATHER THAN `status`, AND THE NAME IS NOT A PREFERENCE.
  // `status` is in `CHECK_VERBS` (`status-verdict.scan.ts`): a leaf with that
  // name PROMISES A VERDICT a script can branch on, and must therefore carry its
  // answer in its exit code. This is a WRITE — it has no verdict to carry — so
  // the honest fix is to stop wearing the name, not to ledger an exemption. It
  // also matches the SDK method (`tracks.setStatus`) exactly.
  const setStatus = tracks
    .command("set-status")
    .description("Move the track to a status — this is how a track finishes")
    .argument("<trackId>", "The track to move")
    .addOption(
      enumOption(
        "--to <status>",
        "Where the track is now",
        TRACK_SET_STATUS__BODY_STATUS
      ).makeOptionMandatory()
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks set-status 11111111-1111-4111-8111-111111111111 --to DONE
  $ nexus tracks set-status 11111111-1111-4111-8111-111111111111 --to BLOCKED
  $ nexus tracks set-status 11111111-1111-4111-8111-111111111111 --to IN_PROGRESS --json

Notes:
  DONE IS HOW A TRACK ENDS, AND THERE IS NO DELETE. A finished track keeps its
  diary, its events and its memory — those ARE the record of how the work went,
  and every one of them would be destroyed with the row.
  DONE AND BLOCKED LEAVE "nexus tracks ready" ON THE VERY NEXT CALL. Nothing has
  to be refreshed and there is no cache. IN_REVIEW does NOT leave it: work
  waiting on a reviewer is still work somebody can pick up.
  A DONE TRACK IS STILL IN "nexus tracks list". That is the difference between
  the two reads — ready answers what can be worked on, list answers what exists.
  EVERY STATUS IS REACHABLE FROM EVERY OTHER ONE. A track marked DONE that turns
  out not to be takes one call to move back; there is no transition table and no
  escape hatch to find.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist. That is deliberate — the two must not be distinguishable.
  Needs the "tracks:write" scope.`
    )
    .action(async (trackId: string, opts: { to: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.setStatus(trackId, {
          status: opts.to as TrackStatus
        });

        printSuccess("Status set.", { trackId: result.trackId, status: result.status });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(setStatus, TRACK_SET_STATUS_CONTRACT);

  // ── tracks set-next-owner ─────────────────────────────────────────────────
  //
  // `set-next-owner` to sit beside `set-status` above and to match the SDK
  // method (`tracks.setNextOwner`). `next-owner` alone would pass every gate —
  // it is not a check verb — and two writes landing together under two naming
  // schemes is a thing to get wrong later.
  const setNextOwner = tracks
    .command("set-next-owner")
    .description("Say who acts next on this track")
    .argument("<trackId>", "The track to hand over")
    .addOption(
      enumOption(
        "--to <owner>",
        "Who is waited on",
        TRACK_SET_NEXT_OWNER__BODY_NEXT_OWNER
      ).makeOptionMandatory()
    )
    .option("--ref <ref>", "The watcher or agent being waited on. Only with EVENT")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks set-next-owner 11111111-1111-4111-8111-111111111111 --to CUE
  $ nexus tracks set-next-owner 11111111-1111-4111-8111-111111111111 --to USER
  $ nexus tracks set-next-owner 11111111-1111-4111-8111-111111111111 \\
      --to EVENT --ref deploy-watcher-7

Notes:
  THIS IS THE PER-TURN HANDOVER, and it is what "nexus tracks ready" prints
  under WAITING ON. CUE means an agent can proceed, USER means a person has to
  act, EVENT means something outside has to happen first.
  --ref IS CLEARED WHENEVER YOU OMIT IT. It is written on every call and never
  merged, so moving a track from EVENT to USER drops the watcher in the same
  statement. That is not a convenience: the server admits a ref only alongside
  EVENT, so a leftover one would make the next handover fail for a field you did
  not send.
  --ref WITH CUE OR USER IS REFUSED WITH A 400 that names the field. Send it
  with EVENT, or send --to on its own.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist.
  Needs the "tracks:write" scope.`
    )
    .action(async (trackId: string, opts: { to: string; ref?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.setNextOwner(trackId, {
          nextOwner: opts.to as TrackNextOwner,
          // Always sent, never conditional. An omitted --ref MEANS null here,
          // and that is what clears the watcher; spreading it only when present
          // would leave the old value in place and break the next handover.
          nextOwnerRef: opts.ref ?? null
        });

        printSuccess(
          result.nextOwnerRef === null ? "Next owner set." : "Next owner set, watching an event.",
          {
            trackId: result.trackId,
            nextOwner: result.nextOwner,
            nextOwnerRef: result.nextOwnerRef
          }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(setNextOwner, TRACK_SET_NEXT_OWNER_CONTRACT);

  // ── tracks archive ────────────────────────────────────────────────────────
  //
  // 🔴 THIS IS THE NAMESPACE'S ANSWER TO "DELETE A TRACK", AND THERE IS NO
  // `tracks delete`. A track's diary, events and memory are children of the row
  // under ON DELETE CASCADE, so a real delete destroys the record of how the
  // work went. This writes one nullable column instead.
  //
  // ONE COMMAND, BOTH DIRECTIONS, on `tracks task toggle`'s established shape —
  // an `archive`/`unarchive` pair would be two commands onto one column, which
  // is how they drift.
  //
  // THE NOTE BELOW SAYS THERE IS NO DELETE WITHOUT SPELLING ONE. `help-claims`
  // rule C1 is TOTAL — every `nexus <words>` string in help PROSE must resolve
  // against the live commander tree, and it has no way to read a negation. So a
  // sentence denying a command still cites it, and the gate is right to red.
  // State the absence in words; keep the quoted form for commands that exist.
  const archive = tracks
    .command("archive")
    .description("Put the track away, or bring it back — this is instead of deleting it")
    .argument("<trackId>", "The track to put away")
    .option("--undo", "Bring it back instead of putting it away")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks archive 11111111-1111-4111-8111-111111111111
  $ nexus tracks archive 11111111-1111-4111-8111-111111111111 --undo
  $ nexus tracks list --archived only

Notes:
  A TRACK IS NEVER DELETED, AND THIS IS WHY. A track's diary, its
  events and its memory are the record of how the work went, and every one of
  them is destroyed with the row. Archiving takes the track out of the way and
  leaves all of it readable.
  IT IS REVERSIBLE. Run it again with --undo. An archive nobody can undo is a
  delete whose damage is only harder to see.
  FIND WHAT YOU PUT AWAY WITH "nexus tracks list --archived only". An archived
  track is absent from "nexus tracks ready" and from the default page of
  "nexus tracks list", so that flag is the only way back to it.
  IT DOES NOT TOUCH THE STATUS. DONE says the work finished; archived says the
  track was put away, which a PLANNED track that turned out to be a mistake
  also is. Use "nexus tracks set-status" for the other one.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist.
  Needs the "tracks:write" scope.`
    )
    .action(async (trackId: string, opts: { undo?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `--undo` is the ONLY spelling of the reverse, and its absence means
        // archive. A `--archived <bool>` flag would put a querystring boolean in
        // a human's hands, where "false" reads as true to more than one parser.
        const archived = opts.undo !== true;
        const result = await client.tracks.archive(trackId, { archived });

        printSuccess(archived ? "Track archived." : "Track restored.", {
          trackId: result.trackId,
          archivedAt: result.archivedAt
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(archive, TRACK_ARCHIVE_CONTRACT);

  // ── tracks list ───────────────────────────────────────────────────────────
  const list = tracks
    .command("list")
    .description("Every track in your organization — what exists, not what is ready")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .option("--cursor <cursor>", "A `nextCursor` from a previous page. Never build one")
    .addOption(enumOption("--status <status>", "Narrow to one status", TRACK_LIST__PARAMS_STATUS))
    .addOption(
      enumOption(
        "--archived <mode>",
        "What to do about archived tracks. exclude when omitted",
        TRACK_LIST__PARAMS_ARCHIVED
      )
    )
    .addOption(
      enumOption(
        "--next-owner <owner>",
        "Only tracks waiting on this kind of actor. Every owner when omitted",
        TRACK_LIST__PARAMS_NEXT_OWNER
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks list
  $ nexus tracks list --status DONE
  $ nexus tracks list --next-owner USER
  $ nexus tracks list --limit 200 --json

Notes:
  THIS IS NOT "nexus tracks ready". That one answers what can be worked on and
  hides everything DONE, BLOCKED or blocked by a dependency. This answers what
  EXISTS, so a track you finished is here and nowhere else.
  IT IS ORDERED BY NUMBER AND NOTHING ELSE. Nothing in a track can rank it —
  there is no priority, no estimate and no due date — so any other order would
  assert a ranking the product does not hold.
  ARCHIVED TRACKS ARE HIDDEN BY DEFAULT. Run with --archived only to find one
  you put away, and --archived include to see both at once. That is the entire
  recovery path for "nexus tracks archive", and it is why archiving is not a
  delete.
  --next-owner NAMES A KIND OF ACTOR, NOT A PERSON. USER means a human is due
  next, CUE means the agent, EVENT means an external watcher. It is what the
  WAITING ON column shows. There is no per-user filter anywhere in this API, so
  --next-owner USER is "waiting on a human" and not "waiting on you".
  AN EMPTY LIST MEANS NO TRACK MATCHED YOUR FILTERS, not that the read failed.
  Run with --json and check for an empty array rather than reading the dimmed
  "No results." line as an error.
  A NON-EMPTY PAGE MAY STILL BE PARTIAL, AND --limit DEFAULTS TO 50 SERVER SIDE.
  Unlike the two ready reads, this answer says so: it carries total, hasMore and
  nextCursor, the footer under the table prints how many of how many you are
  looking at, and it names the exact command for the rest.
  PAGE WITH --cursor, NEVER AN OFFSET, and there is no offset flag to reach for.
  The ceiling is 200 rows, so an organization past 200 tracks is reachable ONLY
  by paging. Round-trip the token verbatim and stop when hasMore is false.
  A CURSOR CARRIES THE FILTERS IT WAS ISSUED UNDER. Replaying it under a
  different --status, --archived or --next-owner is refused with a 400 rather
  than quietly resuming inside a different list, so change a filter and start
  again from the first page. --limit is not bound in.
  Needs the "tracks:read" scope.`
    )
    .action(
      async (opts: {
        limit?: number;
        cursor?: string;
        status?: string;
        archived?: string;
        nextOwner?: string;
      }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const result = await client.tracks.list({
            limit: opts.limit,
            ...(opts.cursor !== undefined && { cursor: opts.cursor }),
            ...(opts.status !== undefined && { status: opts.status as TrackStatus }),
            ...(opts.archived !== undefined && {
              archived: opts.archived as "exclude" | "only" | "include"
            }),
            ...(opts.nextOwner !== undefined && { nextOwner: opts.nextOwner as TrackNextOwner })
          });

          printEnvelope(result, () => {
            // 🔴 `ARCHIVED` IS A COLUMN RATHER THAN A FLAG-CONDITIONAL ONE.
            // Under `--archived include` the page mixes live and archived rows,
            // and without this column they are indistinguishable — which would
            // make the one mode that exists for recovery the one that cannot tell
            // you what to recover. A column that appears only under some flags is
            // worse: the header moves, and a script reading a fixed layout breaks
            // on a flag it did not pass. `CURRENT STEP` gives up 10 characters to
            // pay for it. Found by bugbot on #4146.
            printTable(result.tracks, [
              { key: "number", label: "#", width: 6 },
              { key: "slug", label: "SLUG", width: 28 },
              { key: "title", label: "TITLE", width: 40 },
              { key: "status", label: "STATUS", width: 13 },
              { key: "archivedAt", label: "ARCHIVED", width: 12 },
              { key: "nextOwner", label: "WAITING ON", width: 12 },
              { key: "currentStep", label: "CURRENT STEP", width: 30 },
              { key: "id", label: "ID", width: 38 }
            ]);

            // 🔴 THE PAGE FOOTER IS THE ONLY THING THAT SAYS THE PAGE WAS CUT.
            // `--limit` defaults to 50 SERVER SIDE, so a table of fifty rows is
            // what both a full page and a complete set look like — the read is
            // truncated for a caller who passed no flag at all, and the terminal
            // channel had nothing that distinguished the two. `total`, `hasMore`
            // and `nextCursor` have been on the wire the whole time and only
            // `--json` could see them, which put the recovery path behind the
            // one channel a person is not using.
            //
            // "row(s)" rather than a pluralised noun: this line renders at n=1
            // as readily as at n=50, and a `plural()` that swaps the noun and
            // leaves the verb is a bug this namespace has already shipped once.
            //
            // Human channel only — `printEnvelope` does not run this callback
            // under `--json`, where the three fields are already in the
            // document, so a script's answer cannot be contaminated by it.
            console.log(
              color.dim(`\n${result.tracks.length} of ${result.total} matching row(s) shown.`)
            );
            if (result.hasMore && result.nextCursor !== null) {
              // The command a reader runs next, spelled out. A `nextCursor` a
              // caller can see and cannot use is what this command shipped with:
              // the token was in the document and no flag accepted it.
              //
              // 🔴 BUILT, NEVER INTERPOLATED HERE. The cursor fingerprints the
              // filters and the token contains `*`, so the naive one-line form
              // is refused by the server after any filtered page and by zsh on
              // every unfiltered one. `track-list-next-page-command.ts` owns both
              // reasons and is unit-tested against them.
              console.log(
                color.dim(`  The rest:\n    ${trackListNextPageCommand(opts, result.nextCursor)}`)
              );
            }
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(list, TRACK_LIST_CONTRACT);

  // ── tracks get ────────────────────────────────────────────────────────────
  const get = tracks
    .command("get")
    .description("One track by id")
    .argument("<trackId>", "The track to read")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks get 11111111-1111-4111-8111-111111111111
  $ nexus tracks get 11111111-1111-4111-8111-111111111111 --json

Notes:
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist. The two are deliberately indistinguishable, so this cannot be used to
  find out whether an id belongs to somebody else.
  nextOwnerRef IS ONLY EVER SET ALONGSIDE nextOwner EVENT. On a CUE or USER
  track it reads null, and that is the only legal pair.
  THIS DOES NOT REPORT PROGRESS. Run "nexus tracks rollup <trackId>" for the
  done/total counts over the task tree.
  Needs the "tracks:read" scope.`
    )
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const track = await client.tracks.get(trackId);

        // 🔴 EVERY FIELD THE PAYLOAD CARRIES, AND THE LIST IS HAND-BUILT, SO A
        // NEW ONE IS INVISIBLE UNTIL SOMEBODY ADDS IT HERE. `archivedAt` was
        // published on the wire precisely so a caller holding an id could tell a
        // live track from one that was put away — and this record rebuilt the
        // object without it, so both the terminal view and `--json` hid the one
        // fact the archive route exists to expose. Found by bugbot on #4146.
        printRecord({
          id: track.id,
          number: track.number,
          slug: track.slug,
          title: track.title,
          shortTitle: track.shortTitle,
          status: track.status,
          currentStep: track.currentStep,
          nextOwner: track.nextOwner,
          nextOwnerRef: track.nextOwnerRef,
          archivedAt: track.archivedAt,
          createdAt: track.createdAt,
          updatedAt: track.updatedAt
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(get, TRACK_READ_CONTRACT);

  // ── tracks rollup ─────────────────────────────────────────────────────────
  const rollup = tracks
    .command("rollup")
    .description("The track's progress — leaves done, leaves total")
    .argument("<trackId>", "The track to report on")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks rollup 11111111-1111-4111-8111-111111111111
  $ nexus tracks rollup 11111111-1111-4111-8111-111111111111 --json

Notes:
  COUNTS, NEVER A PERCENTAGE. Divide them yourself. A percentage is a display
  decision, and a caller handed one cannot recover the counts.
  IT COUNTS LEAVES ONLY, at any nesting depth. A parent task is structure
  rather than work, so it is in neither number: one parent holding three
  children reads 0/3, never 0/4.
  IT COUNTS STEP LEAVES ONLY. A DECISION or a DEFINITION is content recorded on
  the board — a choice that was taken, a rule that was settled — and is never
  outstanding work, so it is in neither number either. byKind is the whole task
  set partitioned, so you can see exactly what done/total left out. A STEP whose
  only children are content is a LEAF rather than structure, so the work it
  names does not vanish with them.
  0/0 IS NOT AN ERROR AND IT MEANS A REAL, READABLE TRACK WITH NO WORK ON IT.
  A track you cannot reach is a 404, and that one answer covers an absent id,
  another organization's and an ungranted one alike — so the status code tells
  you the track is unreachable without ever telling you whether it exists.
  Needs the "tracks:read" scope.`
    )
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const progress = await client.tracks.readRollup(trackId);

        // 🔴 `byKind` IS PRINTED BESIDE THE COUNTS BECAUSE THE COUNTS NARROWED.
        // `done`/`total` count STEP leaves, so a reader seeing a denominator
        // smaller than the plan needs the partition in the same answer — a
        // number that excludes rows without saying which is a number nobody can
        // check. Flattened rather than nested: `printRecord` renders one level,
        // and an object value would print as [object Object].
        printRecord({
          done: progress.done,
          total: progress.total,
          steps: progress.byKind.STEP,
          decisions: progress.byKind.DECISION,
          definitions: progress.byKind.DEFINITION
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(rollup, TRACK_READ_ROLLUP_CONTRACT);

  // ── tracks ready ──────────────────────────────────────────────────────────
  const ready = tracks
    .command("ready")
    .description("The tracks that can be worked on right now")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks ready
  $ nexus tracks ready --limit 5
  $ nexus tracks ready --json

Notes:
  THIS IS DERIVED ON EVERY READ AND THERE IS NOTHING TO REFRESH. The ready set
  is a join over the dependency edges, so marking a blocker done makes its
  dependents appear in the very next call. There is no readyAt column, no cache
  and no invalidation step to run first.
  THE ORDER IS THE TRACK NUMBER, ASCENDING, so the oldest track comes first.
  AN EMPTY LIST IS AN ANSWER, NOT A FAILED READ. A track is absent when it is
  DONE or BLOCKED, when it is archived, or when any track it waits on has not
  reached DONE — a blocker still PLANNED, IN_PROGRESS or IN_REVIEW holds it
  exactly as hard as one that is BLOCKED. An organization with no tracks at all
  reads the same. Run "nexus tracks ready --json" and check for an empty array
  rather than reading the dimmed "No results." line as an error.
  --limit DEFAULTS TO 50 SERVER SIDE, SO A TRACK IS ALSO ABSENT WHEN IT FELL OFF
  THE PAGE. That is a fifth reason, it needs no flag to happen, and it is the
  one this list used to omit. The order is the track number ascending and a new
  track takes the highest number, so the tracks a default page hides are always
  the NEWEST ones — including one you just created.
  THE ANSWER SAYS WHEN A PAGE WAS CUT. hasMore is true when the ready set is
  larger than this page, and the footer under the table says so. Raise --limit,
  up to 200, and re-read before reading an absence as DONE, BLOCKED, archived or
  dependency-held. There is deliberately no total and no cursor: this route
  answers what can be worked on now, and "nexus tracks list" is the paged surface
  when a caller needs to walk a set.
  nextOwner SAYS WHO IS WAITED ON, NOT WHO OWNS THE TRACK. CUE means an agent
  can proceed, USER means a person has to act, EVENT means something outside
  has to happen first.
  Needs the "tracks:read" scope.`
    )
    .action(async (opts: { limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listReady({ limit: opts.limit });

        // 🚨 EVERY LIST IN THIS NAMESPACE PRINTS THE WHOLE ENVELOPE UNDER --json,
        // AND THE ONE PLACE IT MATTERS IS `memory list`: its envelope carries
        // `trackMemoryBytes` and `budgetBytes` beside the rows, and printing the
        // array alone put the byte budget — the entire reason that read exists —
        // out of reach of every script. One rule across the namespace rather than
        // an exception on the one command that needs it, because the narrowing is
        // copy-paste: the table wants one array, so the action takes one array,
        // and the document silently inherits the table's taste.
        printEnvelope(result, () => {
          // 🔴 THE SAME COLUMNS AS `tracks list`, IN THE SAME ORDER, MINUS
          // `STATUS` — which `ready` cannot vary usefully, since a DONE or
          // BLOCKED track is not in this set by construction. Two reads of the
          // same rows printing different columns is how a person learns to
          // trust one and re-run the other.
          //
          // SLUG is the column this table shipped without, and the omission
          // survived putting `slug` on the wire: the row carried it, the human
          // view did not, so the only handle on screen was a number the server
          // mints and an id nobody types. Found by bugbot on #4146.
          printTable(result.tracks, [
            { key: "number", label: "#", width: 6 },
            { key: "slug", label: "SLUG", width: 28 },
            { key: "title", label: "TITLE", width: 40 },
            { key: "nextOwner", label: "WAITING ON", width: 12 },
            { key: "currentStep", label: "CURRENT STEP", width: 40 },
            { key: "id", label: "ID", width: 38 }
          ]);

          // 🔴 A FULL PAGE AND A COMPLETE SET USED TO BE THE SAME OUTPUT. The
          // rows dropped are always the NEWEST tracks — the statement orders by
          // number ascending and a new track takes the highest — so the one you
          // just created is the first to fall off. `hasMore` is the server's own
          // answer, read one row past the page, and it is the only thing that
          // separates the two.
          //
          // NO DENOMINATOR: this route carries no total and no cursor by design,
          // so there is no "x of y" to print. Naming a total the response does
          // not have would be the same over-claim this line exists to remove.
          //
          // The ceiling is NOT repeated here. `--limit`'s own description
          // documents its range, and a third copy of 200 is a third thing to go
          // stale — which is exactly how the signal this renders died quietly
          // before it existed. The footer names the action; the flag names the
          // range.
          //
          // Silent when `hasMore` is false. A footer on a complete set is noise,
          // and worse, it teaches the reader to skim the footer — so on the day
          // it carries the warning it does not get read.
          //
          // Human channel only — `printEnvelope` returns before calling this
          // under `--json`, where `hasMore` is already in the document.
          if (result.hasMore) {
            console.log(
              color.dim(
                `\n${result.tracks.length} row(s) shown. MORE TRACKS ARE READY — raise --limit and re-read.`
              )
            );
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(ready, TRACK_LIST_READY_CONTRACT);

  // ── tracks dependency ─────────────────────────────────────────────────────
  const dependency = tracks.command("dependency").description("Declare which track blocks which");

  const dependencyAdd = dependency
    .command("add")
    .description("Say that one track must finish before another may start")
    .requiredOption("--blocker <trackId>", "The track that must finish first")
    .requiredOption("--blocked <trackId>", "The track that waits")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks dependency add \\
      --blocker 11111111-1111-4111-8111-111111111111 \\
      --blocked 22222222-2222-4222-8222-222222222222

Notes:
  AN EDGE THAT WOULD CLOSE A CIRCLE IS REFUSED WITH 409, and the refusal names
  the circle in traversal order. A two-node circle says so in those words,
  because "you already said B blocks A" is a thing a person can fix without
  reading a graph. When the names cannot be resolved inside the refusing
  transaction the circle comes back empty and the message says to re-read the
  dependencies.
  THE LOCK THIS TAKES IS ORGANISATION-WIDE, not per track. A track-level circle
  can run through any track in the organisation, so two inserts on two different
  tracks that jointly close one would otherwise never meet.
  ADDING AN EDGE CHANGES THE READY SET IMMEDIATELY, because "nexus tracks ready"
  is derived on every read. Only a blocker that has NOT reached DONE removes the
  blocked track from that set: an edge whose blocker is already DONE changes
  nothing.
  Needs the "tracks:write" scope.`
    )
    .action(async (opts: { blocker: string; blocked: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const edge = await client.tracks.createDependencyEdge({
          blockerTrackId: opts.blocker,
          blockedTrackId: opts.blocked
        });

        printSuccess("Dependency added.", { id: edge.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(dependencyAdd, TRACK_CREATE_DEPENDENCY_EDGE_CONTRACT);

  // ── tracks section ────────────────────────────────────────────────────────
  const section = tracks.command("section").description("Work with a track's section tree");

  const sectionCreate = section
    .command("create")
    .description("Create one section, at a chosen index among its siblings")
    .argument("<trackId>", "The track to create the section in")
    .requiredOption(
      "--slug <slug>",
      "1-64 chars of [a-z0-9-], starting with a letter or digit. The last segment of the path"
    )
    .requiredOption("--title <title>", "What the section is called")
    .option("--parent <sectionId>", "Nest it under this section. Omit to create at the root")
    .option("--body-text <text>", "The section's prose")
    .option("--position <n>", "Index among its siblings. Omit to append", (v: string) => Number(v))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks section create 11111111-1111-4111-8111-111111111111 \\
      --slug discovery --title "Discovery"
  $ nexus tracks section create 11111111-1111-4111-8111-111111111111 \\
      --slug notes --title "Notes" --parent 44444444-4444-4444-8444-444444444444 --position 0

Notes:
  THE PATH IS THE ADDRESS, AND THE SLUG IS ITS LAST SEGMENT. A section nested
  under "discovery" with slug "notes" has the path "discovery/notes". A sibling
  already holding that path is a 409.
  --body-text FILLS THE SECTION'S PROSE, NOT THE REQUEST BODY. This command
  declares no --body flag, and neither does the root program; every field of
  this write has its own flag.
  A --position PAST THE END CLAMPS TO THE APPEND INDEX. A negative one is
  refused with a 400, and omitting it appends.
  THE WHOLE WRITE HOLDS THE TRACK'S ROW LOCK. Two sections created at the root
  at the same index would otherwise both be stored — Postgres treats NULL
  parents as distinct, so the sibling uniqueness index does not cover the root.
  Needs the "track_sections:write" scope.`
    )
    .action(
      async (
        trackId: string,
        opts: {
          slug: string;
          title: string;
          parent?: string;
          bodyText?: string;
          position?: number;
        }
      ) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const created = await client.tracks.createSection(trackId, {
            slug: opts.slug,
            title: opts.title,
            parentSectionId: opts.parent ?? null,
            ...(opts.bodyText !== undefined && { body: opts.bodyText }),
            ...(opts.position !== undefined && { position: opts.position })
          });

          printSuccess("Section created.", {
            id: created.id,
            path: created.path,
            position: created.position
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(sectionCreate, TRACK_CREATE_SECTION_CONTRACT);

  const sectionRename = section
    .command("rename")
    .description("Re-slug one section; its whole subtree follows")
    .argument("<trackId>", "The track the section belongs to")
    .argument("<sectionId>", "The section to re-slug")
    .requiredOption(
      "--slug <slug>",
      "The new slug, 1-64 chars of [a-z0-9-], starting with a letter or digit"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks section rename 11111111-1111-4111-8111-111111111111 \\
      44444444-4444-4444-8444-444444444444 --slug research

Notes:
  ONE STATEMENT REWRITES THE WHOLE SUBTREE. rowsRewritten counts the section
  plus every descendant whose path actually changed, so 1 means it was a leaf
  and 0 means the new slug is the one it already had. Nothing walks the tree, and
  that is deliberate: a walk would leave a window in which some paths describe
  the new tree and some the old, and path is the column every lookup reads.
  A SIBLING ALREADY HOLDING THE NEW PATH IS A 409, and nothing is written.
  THE OLD PATH STOPS RESOLVING THE INSTANT THIS RETURNS. Anything that stored a
  path rather than an id has to be updated by whoever stored it.
  Needs the "track_sections:write" scope.`
    )
    .action(async (trackId: string, sectionId: string, opts: { slug: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.renameSection(trackId, sectionId, {
          newSlug: opts.slug
        });

        printSuccess("Section renamed.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(sectionRename, TRACK_RENAME_SECTION_CONTRACT);

  const sectionList = section
    .command("list")
    .description("The track's whole document tree, prose included")
    .argument("<trackId>", "The track to read")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks section list 11111111-1111-4111-8111-111111111111
  $ nexus tracks section list 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE SECTION TREE IS NOT THE TASK TREE. Sections are the track's DOCUMENT — an
  outline with prose under each heading. Tasks are the work, and no task belongs
  to a section: they are two independent hierarchies over one track. "nexus
  tracks task list" is the other one.
  ROWS ARRIVE IN "path" ORDER, so every parent precedes its children and the
  tree builds in one pass. "path" is parent/child, so string order is
  depth-first order. POSITION ORDERS SIBLINGS and is what the board shows.
  BODY IS THE PROSE AND IS NEVER NULL. A section nobody has written under
  carries the empty string, so branching on null branches on a value this API
  does not produce. Use --json to read it; the table shows a length only.
  IT IS NOT PAGED, and there is no --limit. An outline only means anything
  whole, because parentSectionId has to resolve inside the answer.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  Needs the "track_sections:read" scope, which a key holding
  "track_sections:write" already satisfies.`
    )
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listSections(trackId);

        printEnvelope(result, () =>
          printTable(
            result.sections.map((s) => ({ ...s, bodyChars: s.body.length })),
            [
              { key: "path", label: "PATH", width: 40 },
              { key: "title", label: "TITLE", width: 40 },
              { key: "position", label: "POS", width: 5 },
              { key: "bodyChars", label: "PROSE", width: 7 },
              { key: "id", label: "ID", width: 38 }
            ]
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(sectionList, TRACK_LIST_SECTIONS_CONTRACT);

  // ── tracks task ───────────────────────────────────────────────────────────
  const task = tracks.command("task").description("Work with the tasks of a track");

  const taskReady = task
    .command("ready")
    .description("The tasks in one track that can be picked up right now")
    .argument("<trackId>", "The track to read")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task ready 11111111-1111-4111-8111-111111111111
  $ nexus tracks task ready 11111111-1111-4111-8111-111111111111 --limit 5

Notes:
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  gate: true MEANS THE TASK WILL REFUSE ITS OWN COMPLETION WITHOUT EVIDENCE.
  It travels with the row so you know before you start, not at the moment you
  tick the box.
  ONLY STEP TASKS ARE EVER IN THIS SET. A DECISION or a DEFINITION is content
  recorded on the board, so it can never be picked up and is not offered here.
  It can still BLOCK: an unticked content row somebody drew an edge from holds
  its dependents exactly as a step would, because dropping it would release work
  rather than merely show less. Run "nexus tracks task list" to see everything.
  A TASK WAITING ON A SECTION PARENT APPEARS HERE ONCE THAT PARENT'S SUBTREE IS
  DONE. Nobody has to tick the parent: a blocker with children is satisfied by
  every STEP leaf beneath it being done, the same set the rollup counts.
  IT ANSWERS TWO QUESTIONS AND PRINTS TWO TABLES. The first is what you can pick
  up: unblocked AND nextOwner CUE. The second, printed only when it has rows, is
  what is unblocked and waiting on somebody else — USER means a person has to act,
  EVENT means something outside has to happen first.
  COUNT THE FIRST TABLE, NEVER THE TWO TOGETHER. That sum is "how much is
  unblocked", which is a different question and the one that used to be reported
  as readiness: one board read 29 ready when 6 were workable.
  A WAITING ROW IS NOT BLOCKED. Every blocker on it is satisfied. It is absent
  from the first table because it is not your turn, not because anything is
  holding it, so "nexus tracks task why-not-ready" will not explain it and should
  not — it answers the blocker axis, and this is the owner axis.
  nextOwner IS SET AT PLAN IMPORT AND NOWHERE ELSE, because that is the only door
  a task row is born through. A plan whose entries name no owner imports every row
  as CUE, which is what every row meant before the field existed.
  A TASK ANOTHER AGENT HOLDS IS STILL IN THIS LIST, and the rows do not say so.
  The query tests done, leaf and blocker state and never reads the claim, so
  READY means unblocked rather than unattended. Read the task itself with
  "nexus tracks task get <taskId>" — its banner is the only place that
  instruction lives.
  THIS LIST AND THAT BANNER ANSWER DIFFERENT QUESTIONS AND CANNOT CONTRADICT
  EACH OTHER. This is the blocker axis; the banner is the claim axis, rendered
  from the holding agent alone. A task absent here whose banner says nobody is
  on it is blocked and unheld, which is both answers being right.
  --limit DEFAULTS TO 50 SERVER SIDE, so this list is truncated whether or not
  you passed the flag and absence from it is not proof a task is blocked. This
  response carries hasMore, and the footer under the table says so when the page
  was cut. Widen --limit, up to 200, and re-read before reading a missing row as
  blocked. There is deliberately no total and no cursor.
  Needs the "track_tasks:read" scope.`
    )
    .action(async (trackId: string, opts: { limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listReadyTasks(trackId, { limit: opts.limit });

        printEnvelope(result, () => {
          // 🔴 TWO TABLES, NEVER ONE WITH A COLUMN, AND THAT IS THE WHOLE POINT
          // OF THE ROUTE'S NEW SHAPE. The wire already refuses to hand a caller
          // one summable array; rendering both halves back into a single table
          // with a `WAITING ON` column would put the defect back on the surface a
          // person actually reads — 29 rows under one heading, six of them
          // workable. `tracks ready` one grain up DOES use that column, and it is
          // right there: it is a navigation read, and nothing picks work off it.
          printTable(result.workable, [
            { key: "title", label: "TITLE", width: 52 },
            { key: "gate", label: "GATE", width: 6 },
            { key: "acceptance", label: "ACCEPTANCE", width: 52 },
            { key: "id", label: "ID", width: 38 }
          ]);

          // 🔴 PRINTED ONLY WHEN IT HAS ROWS, AND NEVER AS AN EMPTY TABLE. On a
          // board with no owner decisions at all — which is every board that has
          // not been curated, so most of them — a permanent empty second section
          // is a heading that teaches the reader to skip the region. On the day it
          // carries rows, it does not get read.
          if (result.waiting.length > 0) {
            console.log(
              color.dim(
                `\nWAITING ON SOMEBODY ELSE — unblocked, but not yours to pick up.\n` +
                  `Move one to you with a plan that names its owner, or settle it and tick it.`
              )
            );
            printTable(result.waiting, [
              { key: "title", label: "TITLE", width: 52 },
              { key: "nextOwner", label: "WAITING ON", width: 12 },
              { key: "acceptance", label: "ACCEPTANCE", width: 52 },
              { key: "id", label: "ID", width: 38 }
            ]);
          }

          // 🔴 AN EMPTY READY SET AND A FINISHED BOARD RENDER IDENTICALLY, and
          // that is the whole complaint this pointer answers: a board at
          // 127 of 156 with 29 rows open answers ZERO here and reads as nearly
          // done. Nothing else on this surface said where to look.
          //
          // 🔴 IT ASKS ABOUT `workable` ALONE, WHICH IS THE QUESTION A CALLER
          // STANDING HERE HAS — "is there anything for me". A board whose every
          // ready row is parked on a person offers the agent NOTHING, and that is
          // exactly a case somebody needs to be told about rather than one to
          // suppress because the second table happens to be non-empty.
          //
          // ⚠️ IT IS A POINTER, NOT A DIAGNOSIS — deliberately. Deciding whether
          // rows remain open needs the whole plan, which is a SECOND call on the
          // hot path of an autonomous loop that reads this route in a cycle. So
          // the hint costs one line and no request, and the command it names is
          // the one that pays for the answer.
          //
          // Human channel only: `printEnvelope` does not run this callback under
          // `--json`, so a script's document cannot be contaminated by it.
          if (result.workable.length === 0) {
            console.log(
              color.dim(
                `\nNothing is offered. That reads the same whether the board is finished or stuck —\n` +
                  `  nexus tracks task why-not-ready ${trackId}`
              )
            );
          }

          // 🔴 A SEPARATE `if`, NEVER AN `else if`. "Nothing is offered" and "not
          // everything is shown" are different questions with different answers,
          // and chaining them would drop one. They are mutually exclusive only
          // because `clampReadySetLimit` floors the page at 1 — a property of the
          // SERVER, which has no business being encoded as control flow here.
          //
          // This is the route where truncation is reachable today: one production
          // track holds 165 tasks against a default page of 50.
          //
          // No denominator and no repeated ceiling, for the reasons `tracks ready`
          // gives. Silent when `hasMore` is false.
          if (result.hasMore) {
            // 🔴 THE SUM IS PRINTED HERE AND NOWHERE ELSE, and here it is the
            // right number: this line is about the PAGE, and the page is one
            // query over both halves. Everywhere a caller decides what to do,
            // `workable` is the count.
            //
            // The server sorts workable rows to the front, so the rows that fell
            // off are `waiting` ones unless `workable` alone filled the page —
            // which is what makes "raise --limit" honest advice rather than a
            // shrug.
            const shown = result.workable.length + result.waiting.length;
            console.log(
              color.dim(`\n${shown} row(s) shown. MORE ROWS ARE READY — raise --limit and re-read.`)
            );
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskReady, TRACK_LIST_READY_TASKS_CONTRACT);

  const taskList = task
    .command("list")
    .description("The track's whole plan — every task, at every depth")
    .argument("<trackId>", "The track to read")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task list 11111111-1111-4111-8111-111111111111
  $ nexus tracks task list 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS IS NOT "nexus tracks task ready". That one answers what can be picked up
  right now and hides everything done, everything with children, and everything
  waiting on a blocker. This answers what the plan CONTAINS, so a task you
  finished is here and nowhere else — it is the only way to read or audit a
  board whole.
  IT IS NOT PAGED, and there is no --limit. The tree only means anything whole:
  parentTaskId has to resolve inside the answer, and position is unique per
  PARENT rather than per track, so a page would hand you a forest of orphans in
  an order you could not restore.
  ROWS ARE GROUPED BY PARENT, THEN BY position. Sorting the flat array by
  position alone interleaves the branches. Group by parentTaskId first.
  KIND SAYS WHAT THE ROW IS. STEP is work and is the only kind the rollup counts
  or the ready set offers; DECISION and DEFINITION are content recorded on the
  board. Everything is listed here, including the content — this is the board,
  not the burndown.
  READ banner FIRST ON EVERY ROW. It is the only place that says whether another
  agent is on a task, how long ago it was heard from, and the command to take it.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  Needs the "track_tasks:read" scope.`
    )
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listTasks(trackId);

        printEnvelope(result, () =>
          // 🔴 `DONE` IS A COLUMN RATHER THAN A FILTER, for the reason
          // `tracks list` gives about ARCHIVED: this read deliberately shows
          // finished work beside open work, and without the column the one view
          // that shows both cannot tell them apart. `KIND` is here for the same
          // reason one layer over — a DEFINITION and a STEP look identical by
          // title, and telling them apart is the whole point of the field.
          printTable(result.tasks, [
            { key: "title", label: "TITLE", width: 48 },
            { key: "kind", label: "KIND", width: 11 },
            { key: "gate", label: "GATE", width: 6 },
            { key: "doneAt", label: "DONE", width: 12 },
            { key: "position", label: "POS", width: 5 },
            { key: "parentTaskId", label: "PARENT", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskList, TRACK_LIST_TASKS_CONTRACT);

  const taskGet = task
    .command("get")
    .description("One task, with its collision banner")
    .argument("<taskId>", "The task to read")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task get 22222222-2222-4222-8222-222222222222
  $ nexus tracks task get 22222222-2222-4222-8222-222222222222 --json

Notes:
  READ banner FIRST. It is the first field on the wire on purpose: nothing in
  this domain reserves a region of a track or refuses a second worker, so
  collision avoidance is a live instruction that arrives with the thing you
  asked for. It names the exact command to run to take the task.
  nextOwner IS WHOSE TURN IT IS, AND IT IS A THIRD AXIS. CUE means an agent can
  proceed, USER that a person has to act, EVENT that something outside has to
  happen first. It is not the banner (who is on it right now), not doneByUserId
  (who ticked it), and not a permission — it grants and refuses nothing.
  A ROW CAN BE USER AND UNCLAIMED, OR CUE AND HELD. The two say nothing about each
  other, so read both.
  THE BANNER REPORTS WHO IS ON THE TASK, NEVER WHETHER IT CAN BE STARTED. It is
  rendered from the holding agent and a clock, and reads nothing about blockers
  or done state, so "nobody is on this" is not a claim that the task is
  unblocked. Run "nexus tracks task ready <trackId>" for that axis.
  A CLAIM HELD BY AN AGENT THAT IS NO LONGER OPEN READS AS NOBODY ON IT. A
  closed agent and an absent claim mean the same thing and render the same
  banner, so claimedByAgentId can be set while the banner says
  "NOBODY IS ON THIS".
  THE AGE IN THE BANNER COMES FROM THE HEARTBEAT AND FROM NOTHING ELSE. "last
  heard 40s ago" and "last heard 4h ago" are the whole judgement; a holder named
  without an age would read as authority while often describing a dead agent.
  Needs the "track_tasks:read" scope.`
    )
    .action(async (taskId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const found = await client.tracks.readTask(taskId);

        printRecord(found);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskGet, TRACK_READ_TASK_CONTRACT);

  const taskClaim = task
    .command("claim")
    .description("Say you are working on a task, taking it over if somebody already was")
    .argument("<taskId>", "The task to claim")
    .requiredOption("--agent <agentId>", "The OPEN agent claiming it — its name or its id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task claim 22222222-2222-4222-8222-222222222222 \\
      --agent 33333333-3333-4333-8333-333333333333

  $ nexus tracks task claim 22222222-2222-4222-8222-222222222222 \\
      --agent backend-lane

Notes:
  A CLAIM TAKES NO LOCK AND NEVER REFUSES BECAUSE SOMEBODY ELSE HOLDS THE TASK.
  It succeeds and overwrites — claiming and taking over are the same operation,
  which is why there is no separate take-over command. It still answers 404 for
  a task you cannot reach and 409 when that agent is not OPEN on this task's
  track. The next agent to read the task is told who holds it and how long ago
  that agent was last heard from, and decides for itself.
  --agent TAKES AN ID OR A NAME. A name is unique among a track's OPEN agents,
  so the value the banner prints for the HOLDER is a value you can pass. Closing
  an agent frees its name, which is why the uniqueness is only over OPEN ones.
  AN ID WINS WHEN A VALUE COULD BE EITHER. Agent names are unconstrained, so an
  agent may legitimately be NAMED after a uuid — such an agent is claimable by
  its own id and not by that name. The response always carries the resolved id,
  never the spelling you sent.
  ONE REFUSAL, NOT TWO: an unknown name, a name whose agent has been closed, and
  an agent on another track all answer the same 409. It never tells you whether
  a name exists on a track, which is what would let it be probed.
  WHERE AN ID COMES FROM: "nexus tracks agent open" opens an agent on a track
  and prints its id, and "nexus tracks agent list" shows the ones already OPEN
  there. Claiming neither creates an agent nor falls back to an implicit one, so
  a caller holding neither an id nor a name opens one first.
  THE BANNER ON EVERY TASK READ NAMES THIS COMMAND, and that string is
  generated from this registration. It is not a copy you may edit.
  Needs the "track_tasks:write" scope.`
    )
    .action(async (taskId: string, opts: { agent: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const claimed = await client.tracks.claimTask(taskId, { agentId: opts.agent });

        printSuccess("Task claimed.", claimed);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskClaim, TRACK_CLAIM_TASK_CONTRACT);

  const taskToggle = task
    .command("toggle")
    .description("Tick or un-tick one task")
    .argument("<taskId>", "The task to tick or un-tick")
    .requiredOption("--done <bool>", "true ticks it, false un-ticks it", booleanFlag)
    .option("--evidence <text>", "Required when the task is a gate. Ignored on an un-tick")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task toggle 22222222-2222-4222-8222-222222222222 --done true
  $ nexus tracks task toggle 22222222-2222-4222-8222-222222222222 --done true \\
      --evidence "suite green at 154 files, log attached"
  $ nexus tracks task toggle 22222222-2222-4222-8222-222222222222 --done false

Notes:
  A GATE REFUSES ITS OWN COMPLETION WITHOUT EVIDENCE, AND SO DOES EVERYTHING
  ABOVE ONE. Ticking a parent whose subtree holds an unevidenced gate is
  refused with 422, and the refusal names up to five of the blocking gates — a
  reader who sees five knows the shape of the problem and the sixth adds
  nothing.
  AN UN-TICK ERASES THE EVIDENCE, AND IT DOES NOT ASK FIRST. Setting done to
  false clears doneAt, doneByUserId and evidence in one statement — the three go
  to NULL together, because the database refuses evidence on an unticked task —
  so a re-tick has to supply its proof again. --evidence itself is ignored here.
  THIS DOES NOT CLAIM THE TASK. Ticking a task somebody else holds succeeds —
  the claim is coordination, never a lock.
  Needs the "track_tasks:write" scope.`
    )
    .action(async (taskId: string, opts: { done: boolean; evidence?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.toggleTask(taskId, {
          done: opts.done,
          evidence: opts.evidence ?? null
        });

        printSuccess(result.done ? "Task ticked." : "Task un-ticked.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskToggle, TRACK_TOGGLE_TASK_CONTRACT);

  const taskEdge = task
    .command("edge")
    .description("Say that one task must finish before another may start")
    .argument("<trackId>", "The track both tasks belong to")
    .requiredOption("--blocker <taskId>", "The task that must finish first")
    .requiredOption("--blocked <taskId>", "The task that waits")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task edge 11111111-1111-4111-8111-111111111111 \\
      --blocker 22222222-2222-4222-8222-222222222222 \\
      --blocked 55555555-5555-4555-8555-555555555555

Notes:
  AN EDGE THAT WOULD CLOSE A CIRCLE IS REFUSED WITH 409, and the refusal names
  the circle in traversal order.
  THE LOCK THIS TAKES IS PER TRACK, not organisation-wide. A task circle cannot
  leave its own track, so an organisation-scoped lock would serialise every
  planner in the organisation behind one another for nothing.
  BOTH ENDPOINTS MUST BE TASKS OF THE TRACK NAMED IN THE ARGUMENT. A task from
  another track is a 404, not a cross-track edge.
  A BLOCKER WITH CHILDREN IS SATISFIED BY ITS SUBTREE, NOT BY ITS OWN TICK. So a
  --blocker may name a section parent: it releases what it holds once every STEP
  leaf beneath it is done, which is exactly the set "nexus tracks rollup" counts.
  You do not have to tick the parent, and you may.
  EVERY OTHER BLOCKER IS RELEASED BY TICKING THAT ROW ITSELF — a task with no
  children of its own, and any DECISION or DEFINITION whatever hangs under it.
  Needs the "track_tasks:write" scope.`
    )
    .action(async (trackId: string, opts: { blocker: string; blocked: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const edge = await client.tracks.createTaskEdge(trackId, {
          blockerTaskId: opts.blocker,
          blockedTaskId: opts.blocked
        });

        printSuccess("Task dependency added.", { id: edge.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskEdge, TRACK_CREATE_TASK_EDGE_CONTRACT);

  const taskEdges = task
    .command("edges")
    .description("What blocks what, inside this track's plan")
    .argument("<trackId>", "The track whose plan to read")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task edges 11111111-1111-4111-8111-111111111111
  $ nexus tracks task edges 11111111-1111-4111-8111-111111111111 --json

Notes:
  "edges" READS AND "edge" WRITES. This one takes the track and nothing else;
  "nexus tracks task edge" adds one and requires --blocker and --blocked. A
  mistyped read lists; a mistyped write refuses on the missing options.
  THIS IS WHAT ACCOUNTS FOR A TASK "nexus tracks task ready" WITHHOLDS. Ready
  answers what can be picked up NOW; "task list" answers what the plan contains.
  The difference between the two is the set nothing else could explain — and a
  task's blockers are the edges naming IT OR ANY OF ITS ANCESTORS as
  blockedTaskId. An edge hung on a section parent holds every row beneath it and
  those rows carry no edge of their own, so reading only the edges that name a
  task directly reports a genuinely blocked row as unexplained.
  "nexus tracks task why-not-ready" composes that walk for you.
  IT IS UNORDERED. The row carries no position and the table has no ordering
  column, so no order is promised and none should be relied on.
  IT CARRIES NO CYCLE INFORMATION. Refusing a circle is the write path's job,
  inside a lock over a snapshot this read does not have.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  Needs the "track_tasks:read" scope.`
    )
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listTaskEdges(trackId);

        printEnvelope(result, () =>
          printTable(result.edges, [
            { key: "blockerTaskId", label: "BLOCKER (finishes first)", width: 38 },
            { key: "blockedTaskId", label: "BLOCKED (waits)", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskEdges, TRACK_LIST_TASK_EDGES_CONTRACT);

  /**
   * `tracks task why-not-ready` — the only command here that COMPOSES.
   *
   * ⚠️ IT IS DELIBERATELY NOT BOUND TO A CONTRACT, because it maps to no single
   * route: it reads the ready set, the plan and the edges and intersects the
   * three. `contract-help.test.ts` skips an unbound command by construction
   * (`if (!binding) continue;`), and the `tracks` namespace has many other bound
   * commands, so the per-namespace floor that keeps that file from going
   * vacuously green is unaffected. It still has to be classified in
   * `command-universe.ts` like every other leaf.
   *
   * 🔴 IT EXPLAINS A SET IT DOES NOT COMPUTE, AND THAT SEPARATION IS THE POINT.
   * `tracks task ready` remains the sole authority on what may be picked up. A
   * command that ALSO decided readiness would be a second implementation of an
   * anti-join whose two surfaces fail asymmetrically — narrowing what counts as
   * a blocker, or widening what counts as satisfied, hands out genuinely blocked
   * work and the answer looks like a well-formed set of real tasks either way.
   * Nothing here touches that query.
   */
  task
    .command("why-not-ready")
    .description("Why the tasks this track still has open are not being offered")
    .argument("<trackId>", "The track to explain")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task why-not-ready 11111111-1111-4111-8111-111111111111
  $ nexus tracks task why-not-ready 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE ANSWER IS RECONSTRUCTED ON THIS MACHINE AND IS NOT THE SERVER'S OWN
  REASON. The ready set is one query inside the API and it publishes nothing
  about what it withheld, so this command reads the plan and its edges and
  re-derives the rule. The materialised ancestry the server's query reads does
  not cross the wire, so ancestry is rebuilt by walking parentTaskId: faithful
  while the two are in step, and divergent exactly where they have drifted.
  Read every line here as a reconstruction and "nexus tracks task ready" as the
  authority on what may actually be picked up.
  IT ANSWERS THE QUESTION A ROLL-UP CANNOT. A board can read 127 of 156 with 29
  rows open and offer NOTHING, which is indistinguishable from a board that is
  nearly finished. This names the rows that are holding it and says of each
  whether it is WORK or CONTENT, because a content row nobody will ever tick
  holds its dependents exactly as a step would.
  AN EDGE HUNG ON AN ANCESTOR HOLDS EVERYTHING BENEATH IT, and the held row's own
  edge list is empty. The VIA column names that ancestor. Reading only the edges
  that name a task directly reports the row as unexplained.
  A BLOCKER WITH WORK BENEATH IT IS SATISFIED BY THAT SUBTREE, NOT BY ITS OWN
  TICK. "subtree open" means work is still outstanding below it; ticking the
  parent by hand also releases it, and finishing the work is the intended exit.
  IT MAKES NO WRITE AND CHANGES NOTHING. Three reads, all needing only the
  "track_tasks:read" scope.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.`
    )
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());

        // The ready set is asked for at its ceiling so the cross-check below is
        // about the WHOLE set rather than about a default page of 50. A shorter
        // answer than the ceiling is the whole answer.
        const [ready, plan, edges] = await Promise.all([
          client.tracks.listReadyTasks(trackId, { limit: READY_SET_CEILING }),
          client.tracks.listTasks(trackId),
          client.tracks.listTaskEdges(trackId)
        ]);

        // 🔴 THE UNION OF BOTH HALVES, NEVER `workable` ALONE. This report is
        // the BLOCKER axis: it explains every open row the ready set does not
        // offer. A `waiting` row is not blocked — every one of its blockers is
        // satisfied and it is simply somebody else's turn — so feeding only the
        // workable half would put every owner-parked row into the unready set and
        // invent a blocker for it. The answer would be well-formed, plausible and
        // wrong, and nothing would go red.
        //
        // `nextOwner` and blocker state are two axes, exactly as the claim axis
        // and this one already are; this composition reads the blocker axis, so it
        // takes every row the server considers ready.
        const serverReadyIds = [...ready.workable, ...ready.waiting].map((row) => row.id);
        const report = explainUnreadyTasks(
          plan.tasks,
          edges.edges,
          serverReadyIds,
          // 🔴 THE WIRE FIELD, NOT A LENGTH INFERENCE. `>= READY_SET_CEILING`
          // answers "did I get everything I ASKED for", never "is there more",
          // and the two diverge the moment the server clamps below the request.
          // The probe deliberately reads one row past the page and exceeds the
          // server's own max by one, so `hasMore` is trustworthy exactly AT the
          // ceiling — which is where the inference was weakest.
          //
          // READY_SET_CEILING STAYS: it is the limit this call REQUESTS, on the
          // line above. Only the truncation claim moved to the wire.
          ready.hasMore
        );

        printEnvelope(
          {
            trackId,
            // The caveat travels in the DOCUMENT, not only on the terminal. A
            // script is the caller most likely to read this as authoritative.
            reconstruction: RECONSTRUCTION_CAVEAT,
            serverReadyIds,
            ...report
          },
          () => renderWhyNotReady(report, serverReadyIds)
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── tracks plan ───────────────────────────────────────────────────────────
  const plan = tracks.command("plan").description("Import a whole plan into a track");

  const planImport = plan
    .command("import")
    .description("Import tasks and their dependencies as ONE atomic write")
    .argument("<trackId>", "The track to import into")
    .requiredOption("--body <json>", "The plan as JSON, a .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks plan import 11111111-1111-4111-8111-111111111111 \\
      --body '{"tasks":[{"title":"Design"},{"title":"Build"}],"edges":[{"blockerIndex":0,"blockedIndex":1}]}'
  $ nexus tracks plan import 11111111-1111-4111-8111-111111111111 --body ./plan.json
  $ cat plan.json | nexus tracks plan import 11111111-1111-4111-8111-111111111111 --body -

Notes:
  EDGES NAME THEIR ENDPOINTS BY INDEX, AND THE ORDER IS DEPTH-FIRST PRE-ORDER: a
  node, then its whole subtree, then its next sibling. For
  [A [A1, A2 [A2a]], B] the indices are 0:A 1:A1 2:A2 3:A2a 4:B. Getting this
  wrong FAILS SILENTLY — every edge still inserts, every count still matches,
  and the dependencies land on the wrong tasks with no error to read.
  SAY WHAT EACH ENTRY IS, WITH kind. STEP is work and is the default; DECISION
  and DEFINITION are content — a choice you are recording, a rule or an axis you
  are settling. Only STEP counts toward the rollup and only STEP is ever offered
  by "tracks task ready", so importing prose without a kind puts it in the
  denominator for good. It does NOT propagate to children: a DEFINITION under a
  STEP is the ordinary shape, so each node declares its own.
    {"tasks":[{"title":"Rule: every fix ships with its judge","kind":"DEFINITION"},
              {"title":"Extract the lifecycle skeleton"}]}
  SAY WHOSE TURN IT IS, WITH nextOwner. THIS IS THE ONLY DOOR IT ARRIVES
  THROUGH — there is no single-task create and no task update — so a plan that
  names no owner imports every row as CUE and "tracks task ready" can never show
  a waiting half. USER means a person has to act, EVENT that something outside
  has to happen first. Like kind it does NOT propagate: a USER parent whose
  sub-steps are ordinary agent work is the common shape, and inheriting would
  park that whole subtree on somebody who was only asked about the parent.
    {"tasks":[{"title":"Pick the empty-state copy","nextOwner":"USER",
               "children":[{"title":"Wire the three strings"}]}]}
  IT IS ALL OR NOTHING. Any refusal — a circle, an acceptance over 400
  characters, a missing parent — rolls the entire import back, so a half
  imported plan is not a state this command can leave behind.
  taskIdsByIndex COMES BACK IN THE SAME ORDER, so index 3 of the response is the
  id of the task at index 3 of your plan.
  parentTaskId HANGS THE PLAN'S ROOTS UNDER AN EXISTING TASK. Omit it to hang
  them under the track itself.
  THE PLAN NESTS FOUR LEVELS DEEP AT MOST. A fifth level of children is refused
  by the schema, not truncated.
  Needs the "track_tasks:write" scope.`
    )
    .action(async (trackId: string, opts: { body: string }) => {
      try {
        const body = await resolveRequiredBody(opts.body);
        const client = createClient(program.optsWithGlobals());
        const imported = await client.tracks.importPlan(
          trackId,
          asRequestBody<ImportTrackPlanBody>(body)
        );

        printSuccess("Plan imported.", imported);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  // `kind` AND `nextOwner` SIT ON A PLAN NODE, AT EVERY DEPTH, AND NO FLAG CAN
  // REACH EITHER. A plan is a tree of tasks and each node declares its own kind —
  // a DEFINITION under a STEP is the ordinary shape, which is exactly why it does
  // not propagate — so a `--kind` could only ever set one of many. `nextOwner` is
  // the same shape for a sharper reason: a `USER` parent whose sub-steps are
  // ordinary agent work is the common case ("decide the copy" over "wire the three
  // strings"), so the contract refuses to inherit it, and a single `--next-owner`
  // would either park a whole subtree on a person who was only asked about the
  // parent or silently apply to the roots alone. The whole tree arrives through
  // `--body`, which on THIS leaf really is the JSON body (`--body <json>`, a file
  // path or `-` for stdin), unlike `channel whatsapp template create` where
  // `--body` is message text and the JSON arrives on `--body-file`.
  //
  // Four paths per field rather than one because `TrackPlanNodeSchema` declares
  // its nesting with an explicit depth of four rather than a `z.lazy()` recursion
  // — the contract's own refusal of an attacker-controlled recursion depth — so
  // the projection sees four distinct paths for one field.
  bindCommand(planImport, TRACK_IMPORT_PLAN_CONTRACT, {
    "Body.tasks[].kind": "--body only; one kind per node, and a plan is a tree of nodes",
    "Body.tasks[].children[].kind": "--body only; one kind per node, and a plan is a tree of nodes",
    "Body.tasks[].children[].children[].kind":
      "--body only; one kind per node, and a plan is a tree of nodes",
    "Body.tasks[].children[].children[].children[].kind":
      "--body only; one kind per node, and a plan is a tree of nodes",
    "Body.tasks[].nextOwner":
      "--body only; one owner per node, and an owner does not propagate to children",
    "Body.tasks[].children[].nextOwner":
      "--body only; one owner per node, and an owner does not propagate to children",
    "Body.tasks[].children[].children[].nextOwner":
      "--body only; one owner per node, and an owner does not propagate to children",
    "Body.tasks[].children[].children[].children[].nextOwner":
      "--body only; one owner per node, and an owner does not propagate to children"
  });

  // ── tracks agent ──────────────────────────────────────────────────────────
  const agent = tracks.command("agent").description("Work with the agents on a track");

  const agentList = agent
    .command("list")
    .description("The agents on this track, most recently heard from first")
    .argument("<trackId>", "The track to read")
    .addOption(
      enumOption("--state <state>", "Only agents in this state", TRACK_LIST_AGENTS__PARAMS_STATE)
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks agent list 11111111-1111-4111-8111-111111111111
  $ nexus tracks agent list 11111111-1111-4111-8111-111111111111 --state OPEN

Notes:
  AN AGENT HERE IS A RECORD OF A CONTRACT, NEVER A RUNNING PROCESS. Nothing in
  this domain starts an agent, spawns a sandbox or calls a model, and an OPEN
  row does not mean anything is executing right now.
  lastHeardAt IS THE ONLY LIVENESS SIGNAL. Opening an agent sets it to that
  instant, and after that only "nexus tracks agent beat" moves it. An OPEN agent
  that has not beaten in hours is what a dead worker looks like.
  THE NAME IS UNIQUE AMONG OPEN AGENTS ONLY. Closing an agent frees its name for
  reuse, so two rows in this list can share a name when one of them is terminal.
  Needs the "track_agents:read" scope.`
    )
    .action(async (trackId: string, opts: { state?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listAgents(trackId, {
          state: opts.state as never
        });

        printEnvelope(result, () =>
          printTable(result.agents, [
            { key: "name", label: "NAME", width: 28 },
            { key: "state", label: "STATE", width: 9 },
            { key: "lastHeardAt", label: "LAST HEARD", width: 26 },
            { key: "reason", label: "REASON", width: 40 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(agentList, TRACK_LIST_AGENTS_CONTRACT);

  const agentOpen = agent
    .command("open")
    .description("Open one agent on this track")
    .argument("<trackId>", "The track to open the agent on")
    .requiredOption("--name <name>", "1-128 chars. Unique among this track's OPEN agents")
    .option("--depends-on <names...>", "Other agents in this track, BY NAME")
    .option("--acceptance <text>", "What finishing this agent's work means")
    .option("--output-path <path>", "Where the agent is expected to write")
    .option("--model <model>", "A note about which model runs it. Nothing reads it")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks agent open 11111111-1111-4111-8111-111111111111 --name plan-importer
  $ nexus tracks agent open 11111111-1111-4111-8111-111111111111 --name builder \\
      --depends-on plan-importer --acceptance "suite green" --output-path artifacts/build.log

Notes:
  OPENING AN AGENT STARTS NOTHING. It records that a contract exists, and the
  row is what other commands attribute work to. No process is spawned, no
  sandbox is created and no model is called.
  THE NAME IS UNIQUE AMONG OPEN AGENTS, THROUGH AN INDEX PRISMA CANNOT SEE. A
  second OPEN agent with the same name on the same track is a 409; closing the
  first one frees the name.
  --depends-on TAKES NAMES, NOT IDS, and nothing resolves them. It is a column
  recording what the author said, so a name that matches no agent is stored as
  written and blocks nothing.
  --model IS A LABEL. Nothing in this domain reads it to choose a model.
  Needs the "track_agents:write" scope.`
    )
    .action(
      async (
        trackId: string,
        opts: {
          name: string;
          dependsOn?: string[];
          acceptance?: string;
          outputPath?: string;
          model?: string;
        }
      ) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const opened = await client.tracks.openAgent(trackId, {
            name: opts.name,
            dependsOn: opts.dependsOn ?? [],
            acceptance: opts.acceptance ?? null,
            outputPath: opts.outputPath ?? null,
            model: opts.model ?? null
          });

          printSuccess("Agent opened.", { id: opened.id, name: opened.name, state: opened.state });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(agentOpen, TRACK_OPEN_AGENT_CONTRACT);

  const agentBeat = agent
    .command("beat")
    .description("The heartbeat — record that this agent is still alive")
    .argument("<trackId>", "The track the agent belongs to")
    .argument("<agentId>", "The agent whose heartbeat this is")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks agent beat 11111111-1111-4111-8111-111111111111 \\
      33333333-3333-4333-8333-333333333333

Notes:
  THIS WRITES lastHeardAt AND NOTHING ELSE. It is the one last-heard clock in
  this domain, and every collision banner's staleness is derived from it. No
  sweep reads it — nothing closes an agent for going quiet.
  AN AGENT THAT STOPS BEATING IS NOT CLOSED. Its claims stay on their tasks and
  its row stays OPEN — what changes is that the banner starts telling the next
  reader how long ago it was last heard from, and they decide.
  A CLOSED, DEAD OR RETIRED AGENT IS A 409 HERE, and an id you cannot see is a
  404. Beating a terminal agent does not reopen it, and the refusal is the point:
  refreshing the clock would make the banner report a finished agent as live.
  Needs the "track_agents:write" scope.`
    )
    .action(async (trackId: string, agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const beaten = await client.tracks.beatAgent(trackId, agentId);

        printSuccess("Heartbeat recorded.", { id: beaten.id, lastHeardAt: beaten.lastHeardAt });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(agentBeat, TRACK_BEAT_AGENT_CONTRACT);

  const agentClose = agent
    .command("close")
    .description("Close, retire or kill an agent")
    .argument("<trackId>", "The track the agent belongs to")
    .argument("<agentId>", "The agent to close")
    .addOption(
      enumOption(
        "--state <state>",
        "How it ended",
        TRACK_CLOSE_AGENT__BODY_STATE
      ).makeOptionMandatory()
    )
    .option("--reason <text>", "At least 15 characters for DEAD and RETIRED")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks agent close 11111111-1111-4111-8111-111111111111 \\
      33333333-3333-4333-8333-333333333333 --state CLOSED
  $ nexus tracks agent close 11111111-1111-4111-8111-111111111111 \\
      33333333-3333-4333-8333-333333333333 --state DEAD \\
      --reason "sandbox ran out of disk twice, no output produced"

Notes:
  DEAD AND RETIRED DEMAND A REASON OF AT LEAST 15 CHARACTERS AFTER TRIMMING, and
  the reason is the whole content of those two states. A shorter one is a 400,
  not a stored row with an empty explanation. CLOSED is an ordinary completion
  and owes nothing.
  CLOSING FREES THE NAME. The uniqueness index covers OPEN agents only, so the
  name becomes available for a new agent the moment this returns.
  CLOSING DOES NOT RELEASE THE AGENT'S CLAIMS. The tasks it holds keep pointing
  at it, and the collision banner reads a claim held by a non-OPEN agent as
  nobody being on it.
  Needs the "track_agents:write" scope.`
    )
    .action(async (trackId: string, agentId: string, opts: { state: string; reason?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const closed = await client.tracks.closeAgent(trackId, agentId, {
          state: opts.state as "CLOSED" | "DEAD" | "RETIRED",
          reason: opts.reason ?? null
        });

        printSuccess("Agent closed.", { id: closed.id, state: closed.state });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(agentClose, TRACK_CLOSE_AGENT_CONTRACT);

  // ── tracks diary ──────────────────────────────────────────────────────────
  const diary = tracks.command("diary").description("Read and append a track's log");

  const diaryList = diary
    .command("list")
    .description("The track's log, newest first")
    .argument("<trackId>", "The track to read")
    .addOption(
      enumOption(
        "--kind <kind>",
        "Only entries of this kind",
        TRACK_LIST_DIARY_ENTRIES__PARAMS_KIND
      )
    )
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks diary list 11111111-1111-4111-8111-111111111111
  $ nexus tracks diary list 11111111-1111-4111-8111-111111111111 --kind DECISION --limit 20

Notes:
  THE LOG IS APPEND ONLY AND THERE IS NO DELETE COMMAND, in any spelling. A
  wrong entry is corrected by appending a later one, which is what makes this
  admissible as a record of what happened rather than of what somebody last
  decided should have happened.
  --limit DEFAULTS TO 50 SERVER SIDE. An unfiltered read of a long-running track
  is therefore not the whole log; ask for more explicitly.
  authorUserId IS NULL WHEN THE WRITE CAME FROM A KEY WITH NO OWNING USER. That
  is an absent author, not an anonymous one — nothing fabricates a name.
  Needs the "track_diary:read" scope.`
    )
    .action(async (trackId: string, opts: { kind?: string; limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listDiaryEntries(trackId, {
          kind: opts.kind as never,
          limit: opts.limit
        });

        printEnvelope(result, () =>
          printTable(result.entries, [
            { key: "createdAt", label: "WHEN", width: 26 },
            { key: "kind", label: "KIND", width: 10 },
            { key: "body", label: "ENTRY", width: 64 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(diaryList, TRACK_LIST_DIARY_ENTRIES_CONTRACT);

  const diaryAppend = diary
    .command("append")
    .description("Append one entry to the track's log")
    .argument("<trackId>", "The track to append to")
    .addOption(
      enumOption(
        "--kind <kind>",
        "What sort of entry this is",
        TRACK_APPEND_DIARY_ENTRY__BODY_KIND
      ).makeOptionMandatory()
    )
    .requiredOption("--body-text <text>", "The entry itself")
    .option("--task <taskId>", "The task this entry is about")
    .option("--agent <agentId>", "The agent this entry is about")
    .option("--workspace <workspaceId>", "The workspace the artifact lives in")
    .option("--artifact <path>", "Where the evidence for this entry is")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks diary append 11111111-1111-4111-8111-111111111111 \\
      --kind PROGRESS --body-text "importer landed, 47 tasks created"
  $ nexus tracks diary append 11111111-1111-4111-8111-111111111111 \\
      --kind PROOF --body-text "suite green" \\
      --task 22222222-2222-4222-8222-222222222222 --artifact artifacts/suite.log

Notes:
  THIS IS THE ONLY WRITE THE LOG HAS. There is no update and no delete — not a
  guarded one, an absent one. Correct a wrong entry by appending a later one.
  THE AUTHOR IS THE CREDENTIAL, NEVER SOMETHING YOU PASS. A log whose author is
  caller supplied is a log anybody can write in somebody else's name.
  --body-text IS THE ENTRY, NOT A REQUEST BODY. This command takes no --body
  flag; every field has its own.
  --task, --agent AND --workspace ARE CHECKED. An id that does not resolve
  inside your organisation is a 404 and nothing is written.
  WHERE AN AGENT ID COMES FROM: "nexus tracks agent open" opens an agent on a
  track and prints its id, and "nexus tracks agent list" shows the ones already
  OPEN there. --agent here takes an ID ONLY and resolves no name, unlike
  "nexus tracks task claim". Neither verb is on this screen, because
  "nexus tracks agent" is a different parent from "nexus tracks diary".
  WHERE A TASK ID COMES FROM: "nexus tracks task list" prints one for every row
  of the plan.
  WHERE A WORKSPACE ID COMES FROM: "nexus workspace list". That is a different
  namespace entirely and nothing under "nexus tracks" mints one.
  Needs the "track_diary:write" scope.`
    )
    .action(
      async (
        trackId: string,
        opts: {
          kind: string;
          bodyText: string;
          task?: string;
          agent?: string;
          workspace?: string;
          artifact?: string;
        }
      ) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const entry = await client.tracks.appendDiaryEntry(trackId, {
            kind: opts.kind as never,
            body: opts.bodyText,
            taskId: opts.task ?? null,
            agentId: opts.agent ?? null,
            workspaceId: opts.workspace ?? null,
            artifactPath: opts.artifact ?? null
          });

          printSuccess("Entry appended.", { id: entry.id, kind: entry.kind });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(diaryAppend, TRACK_APPEND_DIARY_ENTRY_CONTRACT);

  // ── tracks memory ─────────────────────────────────────────────────────────
  const memory = tracks.command("memory").description("Read and write a track's memory");

  const memoryList = memory
    .command("list")
    .description("Every memory entry on the track, with the byte budget")
    .argument("<trackId>", "The track to read")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks memory list 11111111-1111-4111-8111-111111111111
  $ nexus tracks memory list 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE BUDGET IS BYTES, NOT CHARACTERS: 8000 per track and 2000 per entry.
  valueBytes is UTF-8 length, so a short string of CJK or emoji can cost three
  or four times its visible length.
  trackMemoryBytes IS SUMMED FROM THE ROWS THIS READ RETURNED, not taken from
  the counter column. That is deliberate: it makes any divergence between the
  two visible here instead of hiding it behind the counter that is supposed to
  track it.
  A FULL BUDGET IS A 409 ON THE NEXT WRITE, not a silent truncation. Delete an
  entry to make room.
  Needs the "track_memory:read" scope.`
    )
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listMemoryEntries(trackId);

        printEnvelope(result, () => {
          printTable(result.entries, [
            { key: "key", label: "KEY", width: 28 },
            { key: "valueBytes", label: "BYTES", width: 8 },
            { key: "value", label: "VALUE", width: 64 },
            { key: "updatedAt", label: "UPDATED", width: 26 }
          ]);

          // 🔴 THE BUDGET IS THE ENTIRE REASON THIS READ EXISTS, AND ONLY --json
          // COULD SEE IT. `trackMemoryBytes` and `budgetBytes` have been on this
          // envelope the whole time and the table printed neither, so the one
          // number a person needs BEFORE writing — how much room is left — was
          // reachable only from the channel a person is not using. This command's
          // own one-line description promises "with the byte budget", which made
          // the help a claim the output did not keep.
          //
          // `budgetBytes` appears EXACTLY ONCE in the whole wire surface, on this
          // response, so there was no other command a human could get it from.
          // `memory put` already prints the running total on its success line,
          // which is what left the list view as the single place it went missing.
          //
          // "byte(s)" rather than a pluralised noun, for the reason `tracks list`
          // gives: this line renders at n=1 as readily as at n=8000.
          //
          // Human channel only — `printEnvelope` returns before calling this
          // under `--json`, where both fields are already in the document, so a
          // script's answer cannot be contaminated by it.
          console.log(
            color.dim(`\n${result.trackMemoryBytes} of ${result.budgetBytes} byte(s) used.`)
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(memoryList, TRACK_LIST_MEMORY_ENTRIES_CONTRACT);

  const memoryPut = memory
    .command("put")
    .description("Create or replace one memory entry")
    .argument("<trackId>", "The track to write to")
    .requiredOption("--key <key>", "1-128 chars of [A-Za-z0-9._-], starting with a letter or digit")
    .requiredOption("--value <text>", "What to remember")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks memory put 11111111-1111-4111-8111-111111111111 \\
      --key staging-url --value https://api-staging.example.com

Notes:
  THE KEY IS A SLUG BECAUSE THE DELETE ROUTE ADDRESSES IT AS A PATH SEGMENT. A
  key holding a slash could be written and never removed, which is the shape
  that silently consumes the budget for ever.
  THE BUDGET IS BYTES AND A WRITE WITH NO ROOM IS A 409: 8000 per track, 2000
  per entry. Nothing is truncated and nothing is evicted to make space.
  PUT REPLACES. Writing an existing key overwrites its value and re-counts its
  bytes; there is no append.
  Needs the "track_memory:write" scope.`
    )
    .action(async (trackId: string, opts: { key: string; value: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.putMemoryEntry(trackId, {
          key: opts.key,
          value: opts.value
        });

        printSuccess("Memory written.", {
          key: result.entry.key,
          valueBytes: result.entry.valueBytes,
          trackMemoryBytes: result.trackMemoryBytes
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(memoryPut, TRACK_PUT_MEMORY_ENTRY_CONTRACT);

  const memoryDelete = confirmable(memory.command("delete"))
    .description("Remove one memory entry and refund its bytes")
    .argument("<trackId>", "The track to write to")
    .argument("<key>", "The key to remove")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks memory delete 11111111-1111-4111-8111-111111111111 staging-url

Notes:
  IT IS IDEMPOTENT. deleted: false means the key was already absent, and that is
  a success, not a failure — read the field rather than the exit code to tell
  the two apart.
  THE BYTES ARE REFUNDED IN THE SAME TRANSACTION, so the trackMemoryBytes this
  returns is already the new total.
  THIS IS THE ONLY VERB THAT REMOVES A ROW. The diary and the event stream
  deliberately have none. It is not the only destructive one:
  "nexus tracks task toggle --done false" erases a task's evidence, and it does
  not ask first.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Needs the "track_memory:delete" scope.`
    )
    .action(async (trackId: string, key: string, opts: { yes?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete memory key "${key}" on track ${trackId}?`, opts)))
          return;

        const result = await client.tracks.deleteMemoryEntry(trackId, key);

        printSuccess(result.deleted ? "Memory entry removed." : "No such key.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(memoryDelete, TRACK_DELETE_MEMORY_ENTRY_CONTRACT);

  // ── tracks event ──────────────────────────────────────────────────────────
  const event = tracks.command("event").description("Read and append a track's event stream");

  const eventList = event
    .command("list")
    .description("The track's event stream, newest first")
    .argument("<trackId>", "The track to read")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks event list 11111111-1111-4111-8111-111111111111
  $ nexus tracks event list 11111111-1111-4111-8111-111111111111 --limit 100

Notes:
  THE STREAM IS APPEND ONLY AND THERE IS NO DELETE COMMAND, on the same terms as
  the diary. If events are ever pruned for volume that will be a retention
  policy, never a delete verb appearing here.
  EVERY EVENT NAMES AN ACTOR. A row with actorAgentId set and actorUserId null
  came from a machine credential with no owning user, which is an absent person
  rather than an anonymous one.
  --limit DEFAULTS TO 50 SERVER SIDE, so an unfiltered read of a busy track is
  not the whole stream.
  Needs the "track_events:read" scope.`
    )
    .action(async (trackId: string, opts: { limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listEvents(trackId, { limit: opts.limit });

        printEnvelope(result, () =>
          printTable(result.events, [
            { key: "createdAt", label: "WHEN", width: 26 },
            { key: "type", label: "TYPE", width: 32 },
            { key: "actorAgentId", label: "AGENT", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(eventList, TRACK_LIST_EVENTS_CONTRACT);

  const eventFeed = event
    .command("feed")
    .description("Every event in the organisation, newest first")
    .option("--limit <n>", "How many rows per page, 1-200", (value: string) => Number(value))
    .option("--cursor <cursor>", "A `nextCursor` from a previous page. Never build one")
    .option("--since <iso>", "Only events at or after this instant, full ISO-8601")
    .option("--type <type>", "Only this exact event type")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks event feed
  $ nexus tracks event feed --limit 100 --type task.claimed
  $ nexus tracks event feed --since 2026-08-01T00:00:00.000Z
  $ nexus tracks event feed --cursor "$(nexus tracks event feed --limit 1 --json | jq -r .nextCursor)"

Notes:
  THIS IS THE WHOLE ORGANISATION, NOT ONE TRACK — every track's events plus the
  ones that name no track. "tracks event list <trackId>" is the per-track read.
  PAGE WITH --cursor, NEVER AN OFFSET, and there is no offset flag to reach for.
  The stream is append only and read newest first, so rows arrive at the head of
  the page you are walking: an offset window would re-serve rows and silently
  skip others. Feed nextCursor back and stop only when it is null.
  A FULL PAGE ALWAYS RETURNS A CURSOR, even when it was the last one — so the
  walk ends with one call that returns no events. That is the ending, not a bug.
  A CURSOR CARRIES THE FILTERS IT WAS ISSUED UNDER, and replaying it with a
  different --since or --type is refused with a 400. That is deliberate: a
  cursor is a position INSIDE a filtered set, so honouring it across a filter
  change would return a correctly-scoped page that starts in the middle, and you
  would have no way to tell. Change filters, start from the first page. --limit
  is not bound in; a bigger page mid-walk is fine.
  ROUND-TRIP THE CURSOR VERBATIM, never build one. It also encodes a position in
  the current sort order, which a hand-built token cannot know.
  --since IS A FULL INSTANT, not a date. "2026-08-01" is refused rather than
  read as midnight, because a mistyped bound that silently returns a different
  window is worse than an error.
  THERE IS NO TOTAL. Counting an append-only stream costs a second scan for a
  number that is stale before it is printed.
  Needs the "track_events:read" scope.`
    )
    .action(async (opts: { limit?: number; cursor?: string; since?: string; type?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listOrganizationEvents({
          limit: opts.limit,
          cursor: opts.cursor,
          since: opts.since,
          type: opts.type
        });

        printEnvelope(result, () =>
          printTable(result.events, [
            { key: "createdAt", label: "WHEN", width: 26 },
            { key: "type", label: "TYPE", width: 32 },
            { key: "trackId", label: "TRACK", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(eventFeed, TRACK_LIST_ORGANIZATION_EVENTS_CONTRACT);

  const eventAppend = event
    .command("append")
    .description("Append one event to the track's stream")
    .argument("<trackId>", "The track to append to")
    .requiredOption("--type <type>", "What happened, 1-128 chars")
    .requiredOption("--agent <agentId>", "The agent that caused it")
    .option("--payload <json>", "The event's own body as JSON, a .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks event append 11111111-1111-4111-8111-111111111111 \\
      --type task.claimed --agent 33333333-3333-4333-8333-333333333333
  $ nexus tracks event append 11111111-1111-4111-8111-111111111111 \\
      --type build.failed --agent 33333333-3333-4333-8333-333333333333 \\
      --payload '{"exitCode":2}'

Notes:
  --agent IS REQUIRED HERE AND IT IS NOT REQUIRED ON THE INTERNAL SURFACE. An
  event needs a user or an agent, and an API key may resolve no owning user — so
  demanding the agent is what makes an actorless event impossible at the door
  instead of a 500 from a database constraint. Your key's owning user is
  recorded alongside it when there is one.
  WHERE AN AGENT ID COMES FROM: "nexus tracks agent open" opens an agent on a
  track and prints its id, and "nexus tracks agent list" shows the ones already
  OPEN there. --agent is REQUIRED here and takes an ID ONLY — it resolves no
  name, unlike "nexus tracks task claim" — and "nexus tracks agent" is a
  different parent from "nexus tracks event", so neither verb appears on this
  screen's own help or on its parent's.
  THE PAYLOAD IS OPAQUE AND NOTHING QUERIES ACROSS IT. Store what a reader will
  need; nothing indexes its fields.
  THE STREAM IS APPEND ONLY. There is no way to remove or edit an event.
  Needs the "track_events:write" scope.`
    )
    .action(async (trackId: string, opts: { type: string; agent: string; payload?: string }) => {
      try {
        const payload =
          opts.payload === undefined ? undefined : await resolveRequiredBody(opts.payload);
        const client = createClient(program.optsWithGlobals());
        const appended = await client.tracks.appendEvent(trackId, {
          type: opts.type,
          actorAgentId: opts.agent,
          ...(payload !== undefined && { payload })
        } satisfies AppendTrackEventBody);

        printSuccess("Event appended.", { id: appended.id, type: appended.type });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(eventAppend, TRACK_APPEND_EVENT_CONTRACT);
}
