import type { AppendTrackEventBody, ImportTrackPlanBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { printEnvelope, printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, resolveRequiredBody } from "../util/body";
import { booleanFlag } from "../util/boolean-flag";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  TRACK_APPEND_DIARY_ENTRY__BODY_KIND,
  TRACK_APPEND_DIARY_ENTRY_CONTRACT,
  TRACK_APPEND_EVENT_CONTRACT,
  TRACK_BEAT_AGENT_CONTRACT,
  TRACK_CLAIM_TASK_CONTRACT,
  TRACK_CLOSE_AGENT__BODY_STATE,
  TRACK_CLOSE_AGENT_CONTRACT,
  TRACK_CREATE_DEPENDENCY_EDGE_CONTRACT,
  TRACK_CREATE_SECTION_CONTRACT,
  TRACK_CREATE_TASK_EDGE_CONTRACT,
  TRACK_DELETE_MEMORY_ENTRY_CONTRACT,
  TRACK_IMPORT_PLAN_CONTRACT,
  TRACK_LIST_AGENTS__PARAMS_STATE,
  TRACK_LIST_AGENTS_CONTRACT,
  TRACK_LIST_DIARY_ENTRIES__PARAMS_KIND,
  TRACK_LIST_DIARY_ENTRIES_CONTRACT,
  TRACK_LIST_EVENTS_CONTRACT,
  TRACK_LIST_MEMORY_ENTRIES_CONTRACT,
  TRACK_LIST_READY_CONTRACT,
  TRACK_LIST_READY_TASKS_CONTRACT,
  TRACK_OPEN_AGENT_CONTRACT,
  TRACK_PUT_MEMORY_ENTRY_CONTRACT,
  TRACK_READ_TASK_CONTRACT,
  TRACK_RENAME_SECTION_CONTRACT,
  TRACK_TOGGLE_TASK_CONTRACT
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
 * ⚠️ `--agent` TAKES AN ID, AND ITS PLACEHOLDER SAYS SO NOW. It read
 * `--agent <name>` while the route resolves an OPEN agent BY ID, so a caller who
 * pasted the agent name out of the banner's own "another agent is working on
 * this" line got a 409 that named nothing. The banner regenerated with the
 * corrected placeholder; the command, its parents and the flag are unchanged.
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
  AN EMPTY LIST MEANS EVERY TRACK IS BLOCKED OR DONE, not that the read failed.
  Run "nexus tracks ready --json" and check for an empty array rather than
  reading the dimmed "No results." line as an error.
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
        printEnvelope(result, () =>
          printTable(result.tracks, [
            { key: "number", label: "#", width: 6 },
            { key: "title", label: "TITLE", width: 48 },
            { key: "nextOwner", label: "WAITING ON", width: 12 },
            { key: "currentStep", label: "CURRENT STEP", width: 48 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
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
  reading a graph.
  THE LOCK THIS TAKES IS ORGANISATION-WIDE, not per track. A track-level circle
  can run through any track in the organisation, so two inserts on two different
  tracks that jointly close one would otherwise never meet.
  ADDING AN EDGE CHANGES THE READY SET IMMEDIATELY. "nexus tracks ready" is
  derived on every read, so the blocked track disappears from it on the very
  next call.
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
    .requiredOption("--slug <slug>", "1-64 chars of [a-z0-9-]. The last segment of the path")
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
  --body-text FILLS THE SECTION'S PROSE, NOT THE REQUEST BODY. The global
  --body flag spelling is not used here; every field of this write has its own
  flag.
  AN OUT-OF-RANGE --position CLAMPS RATHER THAN FAILING. Omitting it appends.
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
    .requiredOption("--slug <slug>", "The new slug, 1-64 chars of [a-z0-9-]")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks section rename 11111111-1111-4111-8111-111111111111 \\
      44444444-4444-4444-8444-444444444444 --slug research

Notes:
  ONE STATEMENT REWRITES THE WHOLE SUBTREE. rowsRewritten counts the section
  plus every descendant, so 1 means it was a leaf. Nothing walks the tree, and
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
  A TRACK IN ANOTHER ORGANISATION ANSWERS EMPTY, NOT 404. The read is anchored
  on your API key's organisation, so a foreign id matches no row and returns
  exactly what a real track with nothing ready returns. An empty answer is
  therefore not proof the track exists.
  gate: true MEANS THE TASK WILL REFUSE ITS OWN COMPLETION WITHOUT EVIDENCE.
  It travels with the row so you know before you start, not at the moment you
  tick the box.
  THIS LIST DOES NOT SAY WHO IS ON A TASK. Read the task itself with
  "nexus tracks task get <taskId>" — its banner is the only place that
  instruction lives.
  Needs the "track_tasks:read" scope.`
    )
    .action(async (trackId: string, opts: { limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listReadyTasks(trackId, { limit: opts.limit });

        printEnvelope(result, () =>
          printTable(result.tasks, [
            { key: "title", label: "TITLE", width: 52 },
            { key: "gate", label: "GATE", width: 6 },
            { key: "acceptance", label: "ACCEPTANCE", width: 52 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(taskReady, TRACK_LIST_READY_TASKS_CONTRACT);

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
  A CLAIM HELD BY AN AGENT THAT IS NO LONGER OPEN READS AS NOBODY ON IT. A
  closed agent and an absent claim mean the same thing and render the same
  banner, so claimedByAgentId can be set while the banner says READY TO START.
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
    .requiredOption("--agent <agentId>", "The id of the OPEN agent claiming it")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracks task claim 22222222-2222-4222-8222-222222222222 \\
      --agent 33333333-3333-4333-8333-333333333333

Notes:
  A CLAIM REFUSES NOTHING AND TAKES NO LOCK. Claiming a task another agent
  holds succeeds and overwrites it — claiming and taking over are the same
  operation, which is why there is no separate take-over command. The next
  agent to read the task is told who holds it and how long ago that agent was
  last heard from, and decides for itself.
  --agent IS AN ID, NOT A NAME. The banner names the HOLDER by name so a person
  can recognise it; the value here is your own agent's id, which the route
  resolves against the OPEN agents of this task's track. A name gets a 409.
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
  --evidence IS IGNORED ON AN UN-TICK. Setting done to false clears the tick;
  it does not clear or rewrite the evidence already recorded.
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
  IT IS ALL OR NOTHING. Any refusal — a circle, an acceptance over 400
  characters, a missing parent — rolls the entire import back, so a half
  imported plan is not a state this command can leave behind.
  taskIdsByIndex COMES BACK IN THE SAME ORDER, so index 3 of the response is the
  id of the task at index 3 of your plan.
  parentTaskId HANGS THE PLAN'S ROOTS UNDER AN EXISTING TASK. Omit it to hang
  them under the track itself.
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
  bindCommand(planImport, TRACK_IMPORT_PLAN_CONTRACT);

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
  lastHeardAt IS THE ONLY LIVENESS SIGNAL, and it moves only when somebody runs
  "nexus tracks agent beat". An OPEN agent that has not beaten in hours is what
  a dead worker looks like.
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
    .requiredOption("--name <name>", "Unique among this track's OPEN agents")
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
  this domain: every collision banner's staleness is derived from it, and so is
  the stale-agent sweep.
  AN AGENT THAT STOPS BEATING IS NOT CLOSED. Its claims stay on their tasks and
  its row stays OPEN — what changes is that the banner starts telling the next
  reader how long ago it was last heard from, and they decide.
  A NON-OPEN AGENT IS A 404 HERE. Beating a closed, dead or retired agent does
  not reopen it.
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
  THE BUDGET IS BYTES, NOT CHARACTERS. valueBytes is UTF-8 length, so a short
  string of CJK or emoji can cost three or four times its visible length.
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

        printEnvelope(result, () =>
          printTable(result.entries, [
            { key: "key", label: "KEY", width: 28 },
            { key: "valueBytes", label: "BYTES", width: 8 },
            { key: "value", label: "VALUE", width: 64 },
            { key: "updatedAt", label: "UPDATED", width: 26 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(memoryList, TRACK_LIST_MEMORY_ENTRIES_CONTRACT);

  const memoryPut = memory
    .command("put")
    .description("Create or replace one memory entry")
    .argument("<trackId>", "The track to write to")
    .requiredOption("--key <key>", "1-128 chars of [A-Za-z0-9._-]")
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
  THE BUDGET IS BYTES AND A WRITE WITH NO ROOM IS A 409. Nothing is truncated
  and nothing is evicted to make space.
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
  THIS IS THE ONLY DESTRUCTIVE VERB IN THE TRACKS NAMESPACE. The diary and the
  event stream deliberately have none.
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
