import type { CreateCheckpointBody, UpdateVersionBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { absent, printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { VERSION_LIST__PARAMS_TYPE, VERSION_LIST_CONTRACT } from "./version.contract.generated";

export function registerVersionCommands(program: Command): void {
  const version = program
    .command("version")
    .description("Manage agent prompt versions — exactly one is production, publishing moves it");

  version.addHelpText(
    "after",
    `
AN AGENT HAS TWO PROMPTS, AND THEY ARE NOT THE SAME PROMPT:
  • the DRAFT — the agent's own prompt, what "nexus agent update --prompt"
    and "version restore" write;
  • the PRODUCTION VERSION — one row of history, and what the agent actually
    runs. Exactly one version is production at a time, so "version publish"
    is a MOVE: it un-marks whichever version was production before.

WHICH ONE RUNS: an agent that has NEVER published runs its draft. The moment
anything publishes a version, the draft stops being served and the published
version is what every conversation gets — until you publish another one.
"version restore" writes the DRAFT ONLY, so on a published agent it changes
nothing at runtime and reports no error. Publish afterwards, or it did not
happen.

TWO TYPES. AUTO versions are written for you whenever the prompt changes.
CHECKPOINT versions are the ones "version create" makes. Both can be renamed,
deleted and published — the type is a label about origin, not a protection.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = addPaginationOptions(
    version
      .command("list")
      .description("List prompt versions for an agent")
      .argument("<agent-id>", "Agent ID")
      // The values are NOT repeated in the description: commander prints
      // `(choices: …)` from the generated list, and a second hand-typed copy is
      // a second thing to go stale.
      .addOption(enumOption("--type <type>", "Filter by type", VERSION_LIST__PARAMS_TYPE))
      .addHelpText(
        "after",
        `
Examples:
  $ nexus version list agt-123
  $ nexus version list agt-123 --type CHECKPOINT
  $ nexus version list agt-123 --limit 5 --json

Notes:
  PROD=yes MARKS THE VERSION THE AGENT ACTUALLY RUNS. No row saying yes means
  the agent has never published and is running its draft, which appears in no
  version list at all — read it with "nexus agent get <agent-id>".
  NO PROMPTS HERE. The list carries names and types only; the prompt text is
  returned by "nexus version get" and nothing else.
  Newest first, and paginated — the default page is 20, so PROD=yes can be on
  page 2. --type CHECKPOINT is the usual filter; AUTO rows accumulate on every
  prompt change and are the bulk of the list.
  ONE PROMPT WRITE PRODUCES TWO ROWS. "agent update --prompt" files the OUTGOING
  draft as an AUTO row and the new text as a CHECKPOINT, so the list grows by
  two per edit rather than one. Counting rows is not counting edits, and a list
  that jumped by more than you expected is this, not a duplicate write.
  meta CARRIES total, page AND hasMore — there is no checkpointCount. To count
  the checkpoints, ask for them and read the total:
  "nexus version list <agent-id> --type CHECKPOINT --json" -> meta.total.
  An agent id your key cannot see answers 404, the same as one that does not
  exist.`
      )
  );

  list.action(async (agentId: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.agents.versions.list(agentId, {
        ...getPaginationParams(opts),
        type: opts.type
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 25 },
        { key: "type", label: "TYPE", width: 12 },
        { key: "isProduction", label: "PROD", width: 6, format: (v) => (v ? "yes" : "no") },
        { key: "createdAt", label: "CREATED", width: 20 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  version
    .command("get")
    .description("Get version details with full prompt")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version get agt-123 ver-456
  $ nexus version get agt-123 ver-456 --json

Notes:
  THIS IS THE ONLY WAY TO READ AN OLD VERSION'S PROMPT — "version list" omits it
  entirely. It is not the only source of A prompt: "agent get" returns the
  agent's current DRAFT at .prompt, and "version restore" returns the text it
  restored. Use this one when you want a specific historical version.
  THE PROMPT IS NEXUS SECTION MARKUP, NOT PLAIN MARKDOWN. It comes back wrapped
  in "::: section: ... :::" and "::: tab: ... :::" directives that carry the
  prompt's structure. Feed it back into "nexus agent update --prompt" verbatim —
  that round-trip is exact and does not double-wrap. Do NOT strip the
  directives, and do not expect prose you can diff against hand-written
  markdown.
  Production is a fact about the AGENT, not about the row: this prints
  Production yes/no by comparing the version to the agent's current published
  one, so the same version can read yes today and no tomorrow.
  A version id belonging to a different agent answers 404 even when it exists.`
    )
    .action(async (agentId: string, versionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const ver = await client.agents.versions.get(agentId, versionId);
        printRecord(ver, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "isProduction", label: "Production", format: (v) => (v ? "yes" : "no") },
          { key: "prompt", label: "Prompt" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  version
    .command("create")
    .description("Create a named checkpoint of the current prompt")
    .argument("<agent-id>", "Agent ID")
    .option("--name <name>", "Checkpoint name")
    .option("--description <text>", "Checkpoint description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version create agt-123
  $ nexus version create agt-123 --name "v1.0" --description "Initial release"
  $ nexus version create agt-123 --body '{"name":"v1.0"}'
  $ nexus version create agt-123 --body '{"name":"v2","prompt":"You are..."}'
  $ nexus version create agt-123 --body '{"name":"v2","autoPublish":false}'

Notes:
  THE FIRST CHECKPOINT ON AN AGENT THAT HAS NEVER PUBLISHED GOES STRAIGHT TO
  PRODUCTION. autoPublish defaults to true exactly then, and to false
  afterwards, so the same command is a quiet deploy the first time and a
  private snapshot every time after. Send {"autoPublish": false} in --body to
  stop it, or {"autoPublish": true} to publish deliberately.
  IT SNAPSHOTS THE AGENT'S CURRENT DRAFT. With no prompt of its own it copies
  the draft as it stands — so update the agent first, then checkpoint it.
  AN EMPTY DRAFT CHECKPOINTS AND PUBLISHES ANYWAY. On a fresh agent whose prompt
  is still null this succeeds, and the two rules above then compose into the one
  outcome nobody wants: an EMPTY version is published to production, and there
  is no unpublish in this API to take it back. Write the prompt first, or pass
  {"autoPublish": false}. Check with "nexus agent get <agent-id>" that .prompt
  is not null before the first checkpoint.
  IT CAN ALSO WRITE THE PROMPT, and there is no flag for that. A "prompt" key
  in --body OVERWRITES the agent's draft, saves the previous draft as an AUTO
  version first, and checkpoints the new text. Max 1,000,000 characters,
  markdown.
  A REWRITTEN PROMPT RE-RESOLVES ITS @mentions. Mentions are matched by name
  against the agent's live skills and collections, so a mention whose target
  was renamed or removed comes back marked not-found and stops working.
  --name is optional and NOT unique: two checkpoints can share a name, and an
  unnamed one prints "(unnamed)".
  Body fields: name, description, prompt, autoPublish. Any other key is
  silently dropped. A flag overrides the same field in --body.
  Verify with "nexus version list agt-123" and read the PROD column.`
    )
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const ver = await client.agents.versions.createCheckpoint(
          agentId,
          asRequestBody<CreateCheckpointBody>(body)
        );
        printSuccess("Checkpoint created.", {
          id: ver.id,
          name: ver.name ?? absent("(unnamed)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  version
    .command("update")
    .description("Update version metadata")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .option("--name <name>", "New name")
    .option("--description <text>", "New description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version update agt-123 ver-456 --name "v1.1"
  $ nexus version update agt-123 ver-456 --body '{"name":"v1.1"}'

Notes:
  METADATA ONLY. Name and description are the only editable fields; a version's
  prompt is immutable by design — checkpoint a new one instead.
  AUTO VERSIONS ARE EDITABLE TOO. Nothing refuses a rename on one, so an AUTO
  row can end up looking hand-made in "version list".
  AN EMPTY UPDATE IS A SUCCESS THAT CHANGES NOTHING — both fields are optional.
  Body fields: name, description. Any other key is silently dropped.`
    )
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        await client.agents.versions.update(
          agentId,
          versionId,
          asRequestBody<UpdateVersionBody>(body)
        );
        printSuccess("Version updated.", { id: versionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  confirmable(version.command("delete"))
    .description("Delete a prompt version")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version delete agt-123 ver-456
  $ nexus version delete agt-123 ver-456 --yes

Notes:
  YOU CANNOT DELETE THE PRODUCTION VERSION, AND THE REFUSAL LOOKS LIKE AN
  OUTAGE. The database blocks it, so this answers HTTP 500 rather than a 4xx
  naming the reason. Publish a different version first, then delete this one.
  Check the PROD column in "nexus version list" before you call it.
  ANY OTHER VERSION GOES, INCLUDING AUTO ONES, and the prompt it held is gone
  with it. There is no undo. The response carries the id and nothing else —
  there is no "deleted" field to assert on, so a 200 IS the confirmation.
  TO DELETE THE PRODUCTION VERSION, PUBLISH ANOTHER ONE FIRST. Three commands,
  in this order — the delete then succeeds:
    $ nexus version list <agent-id>            # find the PROD=yes row
    $ nexus version publish <agent-id> <other-version-id>
    $ nexus version delete <agent-id> <old-version-id>
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete version ${versionId}?`, opts))) return;

        await client.agents.versions.delete(agentId, versionId);
        printSuccess("Version deleted.", { id: versionId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── restore ───────────────────────────────────────────────────────────
  confirmable(version.command("restore"))
    .description("Restore the agent's DRAFT prompt to a previous version — this does not publish")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID to restore")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version restore agt-123 ver-456
  $ nexus version restore agt-123 ver-456 --yes

Notes:
  THIS DOES NOT PUBLISH, AND ON A PUBLISHED AGENT IT CHANGES NOTHING AT
  RUNTIME. It writes the agent's DRAFT prompt only. A published agent serves
  its production version, so every conversation carries on with the old text
  while this reports success. Follow it with
  "nexus version publish <agent-id> <version-id>" to actually roll back.
  IT SAVES NOTHING FIRST. The draft it overwrites is not checkpointed and not
  recoverable — run "nexus version create <agent-id>" before this if the
  current draft matters.
  IT CREATES NO VERSION ROW either, so "version list" looks identical
  afterwards. The only way to see that it ran is to read the agent's prompt.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Verify with "nexus agent get agt-123" and read the prompt.`
    )
    .action(async (agentId: string, versionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (
          !(await confirmDestructive(
            `Restore agent ${agentId} to version ${versionId}? This will overwrite the current prompt.`,
            opts
          ))
        )
          return;

        const result = await client.agents.versions.restore(agentId, versionId);
        printSuccess("Version restored.", { agentId, versionId, ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── publish ───────────────────────────────────────────────────────────
  version
    .command("publish")
    .description("Publish a version to production — THIS IS A MOVE, not an add")
    .argument("<agent-id>", "Agent ID")
    .argument("<version-id>", "Version ID to publish")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus version publish agt-123 ver-456

Notes:
  PUBLISHING UN-MARKS WHICHEVER VERSION WAS PRODUCTION BEFORE. Exactly one
  version is production at a time, so this is a move — and the output names
  only the version that won, never the one that lost it. Read the PROD column
  in "nexus version list" first if you need to be able to go back.
  IT APPLIES TO EVERY DEPLOYMENT OF THIS AGENT AT ONCE. There is no staging,
  no per-channel publish and no confirmation prompt.
  THE FIRST PUBLISH TAKES THE AGENT OFF ITS DRAFT, AND THIS API HAS NO
  UNPUBLISH. Until then the draft is what runs; from here on the agent serves
  published versions only, so editing the prompt stops changing what customers
  get until you publish again.
  Publishing an AUTO version is allowed and is the normal way to roll back to
  a state nobody checkpointed.
  Verify with "nexus version list agt-123": exactly one row reads PROD yes.`
    )
    .action(async (agentId: string, versionId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.agents.versions.publish(agentId, versionId);
        printSuccess("Version published to production.", {
          id: result.id,
          isProduction: "true"
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — including the pagination flags
  // `addPaginationOptions` adds. `bindCommand` renders its block from the
  // command's own options, so anything added afterwards is invisible to it.
  bindCommand(list, VERSION_LIST_CONTRACT);
}
