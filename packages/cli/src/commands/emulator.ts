import type {
  CreateEmulatorSessionBody,
  ReplayEmulatorScenarioBody,
  SaveEmulatorScenarioBody,
  SendEmulatorMessageBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  EMULATOR_CREATE_SESSION_CONTRACT,
  EMULATOR_DELETE_SCENARIO_CONTRACT,
  EMULATOR_DELETE_SESSION_CONTRACT,
  EMULATOR_GET_SCENARIO_CONTRACT,
  EMULATOR_LIST_SCENARIOS_CONTRACT,
  EMULATOR_LIST_SESSIONS_CONTRACT,
  EMULATOR_SAVE_SCENARIO_CONTRACT
} from "./emulator.contract.generated";

export function registerEmulatorCommands(program: Command): void {
  const emulator = program.command("emulator").description("Test deployments via the emulator");

  emulator.addHelpText(
    "after",
    `
Talk to a real deployment's real agent without going through its channel. The
agent, its tools, its knowledge and its billing are the live ones — only the
transport is emulated, so a tool that sends email really sends email.

  session create <dep>  →  send <dep> <session> --text "..."  →  session get

READ THE "status" FIELD "send" RETURNS. "completed" and "failed" are finished
turns; "processing" means the agent is still running. THE REPLY IS NOT IN THE
SEND RESPONSE ON ANY STATUS — "emulator session get" is where every reply is
read, not just a slow one.

Scenarios record a session's messages so they can be replayed against another
deployment. Replay is asynchronous and answers with a NEW session id.

Reads need emulator:read, creating sessions and scenarios emulator:write,
sending and replaying emulator:execute, the two deletes emulator:delete.`
  );

  // ═══════════════════════════════════════════════════════════════════════
  // session sub-group
  // ═══════════════════════════════════════════════════════════════════════
  const session = emulator.command("session").description("Manage emulator sessions");

  session.addHelpText(
    "after",
    `
A session is one conversation with a deployment's agent. Create it, send into
it, then read it back — "session get" is where a turn that was still running
when "emulator send" answered eventually lands.

These are real DeploymentSession rows carrying real conversations, but they are
TEST traffic and "nexus deployment stats" excludes them from both of its
counters, so testing a deployment does not move its usage figures. What they DO
reach is the inbox: deleting one archives its conversation rather than erasing
it.

SO DELETING EVERY SESSION DOES NOT CLEAN UP AFTER A TEST. "session list" comes
back empty while the conversations those sessions produced are still there,
ARCHIVED, and still returned by
"conversation list --deployment-id <dep> --status ARCHIVED". Close them one by
one with "conversation close" if the inbox has to be clear.`
  );

  // ── session create ─────────────────────────────────────────────────────
  const sessionCreate = session
    .command("create")
    .description("Create an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session create 44444444-4444-4444-8444-444444444444
  $ nexus emulator session create 44444444-4444-4444-8444-444444444444 --body '{"participants":[{"identifier":"+15551234567","displayName":"Ada"}]}'
  $ nexus emulator session create 44444444-4444-4444-8444-444444444444 --json

Notes:
  THE ONLY BODY FIELD IS participants, AN ARRAY. Anything else — including the
  singular "participant" this example used to show — is dropped without an
  error, and you get a one-participant session named "Test User" as if you had
  passed nothing. Each entry is {identifier, displayName}, both optional and
  both capped at 256 characters, up to 20 entries.

  THE ids ARE ASSIGNED BY THE SERVER, NOT BY YOU: participant_1, participant_2
  in the order you listed them. That is what "emulator send --body
  '{"participantId":"participant_2"}'" takes — an identifier or a display name
  there is a 400 listing the real ids.
  identifier is the channel address the agent sees (a phone number, an email);
  omitted, one is synthesized from the deployment type.
  The deployment must exist in this organization or it is a 404. It does NOT
  have to be active to create a session — only to send.`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `session create dep-123` with no `--body` is a documented invocation
        // and every field of `CreateEmulatorSessionBody` is optional, so `{}` is
        // a usable value of the right type. The wire delta is an empty JSON
        // object in place of no body; the endpoint parses both to the same `{}`.
        const body = (await resolveBody(opts.body)) ?? {};
        const s = await client.emulator.createSession(
          deploymentId,
          asRequestBody<CreateEmulatorSessionBody>(body)
        );
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session list ───────────────────────────────────────────────────────
  const sessionList = session
    .command("list")
    .description("List emulator sessions")
    .argument("<deployment-id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session list 44444444-4444-4444-8444-444444444444
  $ nexus emulator session list 44444444-4444-4444-8444-444444444444 --json

Notes:
  Emulator sessions for this deployment only, and unpaginated.
  These are real DeploymentSession rows, but "nexus deployment stats" excludes
  them from both totalSessions and totalMessages — that endpoint reports real
  customer traffic, and this command is where test traffic is visible. They are
  still in the inbox: see the "emulator session" notes on archiving.`
    )
    .action(async (deploymentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.emulator.listSessions(deploymentId);
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session get ────────────────────────────────────────────────────────
  session
    .command("get")
    .description("Get emulator session details (with messages)")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session get 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333
  $ nexus emulator session get 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --json

Notes:
  THIS IS WHERE A "processing" TURN LANDS. When "emulator send" gives up
  waiting the agent keeps running and writes its reply here — re-read this
  until the reply appears rather than re-sending, which starts a second turn.
  It is also the only way to read a replayed scenario's result.
  Carries the full message list, so --json is the useful form.`
    )
    .action(async (deploymentId: string, sessionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.emulator.getSession(deploymentId, sessionId);
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "messages", label: "Messages" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── session delete ─────────────────────────────────────────────────────
  const sessionDelete = confirmable(session.command("delete"))
    .description("Delete an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator session delete 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333
  $ nexus emulator session delete 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --yes

Notes:
  THE API ANSWERS 204 WITH NO BODY, unlike the agent-family deletes which
  answer {id, deleted: true} at 200. Nothing from the server is echoed back, so
  the exit code is the whole confirmation — the {"success": true, ...} that
  --json prints is this command's own line, not a server response.
  THE CONVERSATION IS ARCHIVED, NOT DELETED. Only the session row goes; the
  chat it produced is set to ARCHIVED and survives, so this is not a way to
  erase what was said. A scenario saved from this session is untouched and
  stays replayable — it holds its own copy of the messages.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (deploymentId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete emulator session ${sessionId}?`, opts))) return;

        await client.emulator.deleteSession(deploymentId, sessionId);
        printSuccess("Session deleted.", { sessionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // send (top-level under emulator)
  // ═══════════════════════════════════════════════════════════════════════
  emulator
    .command("send")
    .description("Send a message in an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .option("--text <message>", "Message text")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator send 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --text "Hello, agent!"
  $ nexus emulator send 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --body '{"content":"Hi","participantId":"participant_2"}'
  $ nexus emulator send 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --text "Test" --json

Notes:
  THE REPLY IS NEVER IN THIS RESPONSE, ON ANY STATUS. Even on "completed" the
  payload is chatId, messageId, sessionId, status and debug — no text. Reading
  the agent's answer is always a second call:
  "nexus emulator session get <deployment-id> <session-id>". Treat "session get"
  as step two of every send, not as a fallback for a slow turn.

  READ "status". IT IS THE ONLY COMPLETION SIGNAL and it has three values:
  "completed" — the turn finished and "debug" is present; "failed" — the agent
  errored, and the 2xx says nothing about it; "processing" — THE AGENT IS STILL
  RUNNING and the turn has not settled.

  "processing" is not an error and not a timeout you should retry. The call
  waits up to 25 seconds and then answers so the connection is not held open;
  the turn continues server-side and its reply is written to the session.
  Poll "nexus emulator session get <deployment-id> <session-id>" for it.
  RE-SENDING ON "processing" DOES NOT CANCEL ANYTHING — it starts a second
  turn, and the agent answers both.

  There is no "debug" input field. Debug information is collected
  automatically and returned whenever the turn settles inside the wait, so it
  is present on "completed" and absent on "processing".
  DEBUG CARRIES NO PROMPT AND NO REPLY — it is agentId, modelUsed, tokensUsed,
  latencyMs, toolsInvoked and the run ids. toolsInvoked is real and is the
  useful part; there is no way to read the prompt that was sent from here.
  DO NOT BILL FROM debug.tokensUsed. It is summed from token-usage rows that
  are written asynchronously, so a turn that settles first reports {input: 0,
  output: 0, total: 0} beside a real latency and a real reply. Zero here means
  "not recorded yet", never "free" — use "nexus tracing" for token numbers.

  The deployment must be ACTIVE and have an agent, or this is a 400 — that is
  the difference from "session create", which only needs the deployment to
  exist. participantId is the server-assigned "participant_N" from
  "session create"; anything else is a 400 listing the valid ids. Omit it and
  the first participant speaks.
  content is required, 1 to 100,000 characters. --text is the same field.
  This runs the real agent: real tools, real side effects, real cost.
  Save the session as a scenario afterwards for regression testing:
  nexus emulator scenario save`
    )
    .action(async (deploymentId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          content: opts.text
        });

        const result = await client.emulator.sendMessage(
          deploymentId,
          sessionId,
          asRequestBody<SendEmulatorMessageBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════
  // scenario sub-group
  // ═══════════════════════════════════════════════════════════════════════
  const scenario = emulator.command("scenario").description("Manage emulator scenarios");

  scenario.addHelpText(
    "after",
    `
A scenario is a session's USER messages, with the pauses between them, saved
so they can be sent again. IT IS A SCRIPT, NOT A TRANSCRIPT: the agent's
replies are not stored, so replay re-runs the agent live and compares nothing.
Two replays of one scenario can differ, and neither is checked against the
recording. Any assertion is yours to make on the resulting session.

A scenario belongs to the deployment it was recorded from and can only be
replayed against that one — any other is a 403.

Replay is asynchronous: it answers with a NEW session id before anything has
been sent, and "emulator session get" is where the results appear.`
  );

  // ── scenario save ──────────────────────────────────────────────────────
  const scenarioSave = scenario
    .command("save")
    .description("Save an emulator session's user messages as a replayable scenario")
    // --session-id, --deployment-id and --name are all REQUIRED by the route,
    // but each can arrive through --body instead, so none is a
    // Commander-required option — same reasoning as `deployment create`. The
    // API returns a clean validation error naming whichever is missing.
    .option("--session-id <id>", "Session ID (UUID) — required, here or in --body")
    .option("--deployment-id <id>", "Deployment ID (UUID) — required, here or in --body")
    .option("--name <name>", "Scenario name, 1-200 chars — required, here or in --body")
    .option("--description <text>", "Scenario description, up to 1000 chars")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario save --session-id 22222222-2222-4222-8222-222222222222 --deployment-id 55555555-5555-4555-8555-555555555555 --name "Happy path"
  $ nexus emulator scenario save --body '{"sessionId":"22222222-2222-4222-8222-222222222222","deploymentId":"55555555-5555-4555-8555-555555555555","name":"Edge case"}'

Notes:
  A SCENARIO IS THE USER'S SIDE ONLY — IT IS A SCRIPT, NOT A TRANSCRIPT. What
  is saved is the messages the participants sent, with the pauses between
  them; the agent's replies are not stored and are not part of what replay
  compares against. Replaying re-runs the agent from scratch.

  messageCount COUNTS PARTICIPANT MESSAGES, NOT TURNS. A session of one question
  and one agent reply saves as messageCount 1, which is correct and not a lost
  message. Replay's own advice is to compare counts, so compare this against the
  participant messages in the session, never against its total.

  --session-id, --deployment-id and --name are all required, by flag or inside
  --body. name is 1-200 characters, --description is capped at 1000, and both
  ids must be UUIDs.
  The session must belong to the deployment or it is a 403, and a session
  nobody has sent a message in is a 400 — send something first.
  Pauses between messages are recorded and capped at 30 seconds each, so a
  scenario saved over a long lunch replays quickly.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          sessionId: opts.sessionId,
          deploymentId: opts.deploymentId,
          name: opts.name,
          description: opts.description
        });

        const result = await client.emulator.saveScenario(
          asRequestBody<SaveEmulatorScenarioBody>(body)
        );
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario list ──────────────────────────────────────────────────────
  const scenarioList = scenario
    .command("list")
    .description("List emulator scenarios")
    .option("--deployment-id <id>", "Filter by deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario list
  $ nexus emulator scenario list --deployment-id 44444444-4444-4444-8444-444444444444
  $ nexus emulator scenario list --json

Notes:
  Every scenario in the organization unless --deployment-id narrows it, and
  unpaginated. DEPLOYMENT is the one it was recorded from, and it is the ONLY
  deployment it can be replayed against — replay checks the two match and 403s
  otherwise. Copy that value into "scenario replay --deployment-id".
  --deployment-id must be a UUID or it is a 400.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.emulator.listScenarios({
          deploymentId: opts.deploymentId
        });
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "deploymentId", label: "DEPLOYMENT", width: 36 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario get ───────────────────────────────────────────────────────
  const scenarioGet = scenario
    .command("get")
    .description("Get scenario details")
    .argument("<scenario-id>", "Scenario ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario get 11111111-1111-4111-8111-111111111111
  $ nexus emulator scenario get 11111111-1111-4111-8111-111111111111 --json

Notes:
  Messages here are the USER side only, in order, each with the pause that
  preceded it and the participant that sent it. No agent replies are stored —
  see "scenario save".
  Deployment ID is the only deployment "scenario replay" will accept.`
    )
    .action(async (scenarioId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const s = await client.emulator.getScenario(scenarioId);
        printRecord(s, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment ID" },
          { key: "messages", label: "Messages" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario replay ────────────────────────────────────────────────────
  scenario
    .command("replay")
    .description("Replay a scenario — ASYNCHRONOUS, the results are not in the response")
    .argument("<scenario-id>", "Scenario ID")
    .option(
      "--deployment-id <id>",
      "Deployment ID — required, and must be the one the scenario was recorded from"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario replay 11111111-1111-4111-8111-111111111111 --deployment-id 55555555-5555-4555-8555-555555555555
  $ nexus emulator scenario replay 11111111-1111-4111-8111-111111111111 --body '{"deploymentId":"55555555-5555-4555-8555-555555555555"}'
  $ nexus emulator scenario replay 11111111-1111-4111-8111-111111111111 --deployment-id 55555555-5555-4555-8555-555555555555 --json

Notes:
  REPLAY IS ASYNCHRONOUS AND THE RESPONSE CARRIES NO RESULTS. It answers as
  soon as it has created a session, before a single message has been sent —
  what the agent did is not in it and cannot be. Take the sessionId it returns
  and read "nexus emulator session get <deployment-id> <sessionId>" until the
  replies appear.

  IT CREATES A NEW SESSION EVERY TIME. Nothing is overwritten and nothing is
  compared: replay re-runs the agent live, so two replays of one scenario can
  differ, and neither is checked against what happened when it was recorded.
  Any assertion is yours to make on the session afterwards.

  --deployment-id MUST BE THE DEPLOYMENT THE SCENARIO WAS RECORDED FROM.
  Any other is a 403 — a scenario is not portable across deployments.
  Failures after the response are invisible here: the messages are sent in the
  background and a failed replay is logged server-side, leaving a session with
  fewer messages than the scenario has. Compare the counts.
  The real agent runs, with real tools and real cost, once per replay.`
    )
    .action(async (scenarioId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          deploymentId: opts.deploymentId
        });

        const result = await client.emulator.replayScenario(
          scenarioId,
          asRequestBody<ReplayEmulatorScenarioBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── scenario delete ────────────────────────────────────────────────────
  const scenarioDelete = confirmable(scenario.command("delete"))
    .description("Delete a scenario")
    .argument("<scenario-id>", "Scenario ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus emulator scenario delete 11111111-1111-4111-8111-111111111111
  $ nexus emulator scenario delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THE API ANSWERS 204 WITH NO BODY, unlike the agent-family deletes which
  answer {id, deleted: true} at 200. The exit code is the whole confirmation —
  the {"success": true, ...} that --json prints is this command's own line, not
  a server response.
  Permanent: the recorded messages go with it and the session it was taken
  from cannot re-derive them once that session is gone.
  Sessions produced by past replays are NOT deleted and keep their history.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (scenarioId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete scenario ${scenarioId}?`, opts))) return;

        await client.emulator.deleteScenario(scenarioId);
        printSuccess("Scenario deleted.", { scenarioId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`. `session get`,
  // `send` and `scenario replay` reach routes the v1 contract does not declare.
  bindCommand(sessionCreate, EMULATOR_CREATE_SESSION_CONTRACT);
  bindCommand(sessionList, EMULATOR_LIST_SESSIONS_CONTRACT);
  bindCommand(sessionDelete, EMULATOR_DELETE_SESSION_CONTRACT);
  bindCommand(scenarioSave, EMULATOR_SAVE_SCENARIO_CONTRACT);
  bindCommand(scenarioList, EMULATOR_LIST_SCENARIOS_CONTRACT);
  bindCommand(scenarioGet, EMULATOR_GET_SCENARIO_CONTRACT);
  bindCommand(scenarioDelete, EMULATOR_DELETE_SCENARIO_CONTRACT);
}
