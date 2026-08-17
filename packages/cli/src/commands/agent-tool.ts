import type {
  AttachCollectionBody,
  CreateAgentToolBody,
  UpdateAgentToolBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError } from "../errors";
import { printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  TOOL_ATTACH_COLLECTION_CONTRACT,
  TOOL_CREATE__BODY_TYPE,
  TOOL_CREATE_CONTRACT,
  TOOL_DELETE_CONTRACT,
  TOOL_GET_CONTRACT,
  TOOL_LIST_CONTRACT,
  TOOL_UPDATE__BODY_TYPE,
  TOOL_UPDATE_CONTRACT
} from "./agent-tool.contract.generated";

export function registerAgentToolCommands(program: Command): void {
  const agentTool = program.command("agent-tool").description("Manage agent tool configurations");

  agentTool.addHelpText(
    "after",
    `
A tool config belongs to one agent, so <agent-id> always comes first, and
<tool-id> is the CONFIG id from "nexus agent-tool list" — never the marketplace
tool id, which lives at config.toolId inside the config.

Two facts decide whether a config does anything at run time:
  • A WORKFLOW tool must name a PUBLISHED workflow. Attaching a DRAFT is
    accepted with a 201 and the tool then never fires — no error at create and
    none at run time. Publish it first with "nexus workflow publish".
  • agentInputSchema is REQUIRED on create and is stored FLAT: a map of parameter
    name → JSON Schema. It is spread straight into the model's function
    definition, so a wrapped document stored raw yields a tool the provider
    rejects and the agent never sees. Send {} when the agent passes no arguments.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = agentTool
    .command("list")
    .description("List tools attached to an agent")
    .argument("<agent-id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool list 11111111-1111-4111-8111-111111111111
  $ nexus agent-tool list 11111111-1111-4111-8111-111111111111 --json

Notes:
  Unpaginated — the payload is a bare array of every tool config on the agent,
  bounded by how the agent was built rather than by usage.
  ID is the CONFIG id: pass it to get / update / delete.
  ACTIVE is the config's isActive flag, which create sets to true.
  The table omits config and agentInputSchema — read either with
  "nexus agent-tool get" or --json.`
    )
    .action(async (agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const tools = await client.agents.tools.list(agentId);

        printTable(tools, [
          { key: "id", label: "ID", width: 36 },
          { key: "label", label: "LABEL", width: 25 },
          { key: "type", label: "TYPE", width: 15 },
          { key: "isActive", label: "ACTIVE", width: 8, format: (v) => (v ? "yes" : "no") }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────
  const get = agentTool
    .command("get")
    .description("Get tool configuration details")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus agent-tool get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json

Notes:
  THIS IS THE VERIFICATION PATH for create and update, which print only the id.
  It returns the whole config, including the agentInputSchema that was actually
  stored — the field a caller most often gets wrong.
  A WORKFLOW config reads back as config.workflowId, mapped from the internally
  stored config.toolId, so it comes out under the name you wrote it with.`
    )
    .action(async (agentId: string, toolId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const tool = await client.agents.tools.get(agentId, toolId);
        printRecord(tool);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  const create = agentTool
    .command("create")
    .description("Add a tool to an agent")
    .argument("<agent-id>", "Agent ID")
    // --label and --type belong to the API contract (CreateAgentToolBody) but
    // can also come from --body, so neither is Commander-required — the API
    // returns a clean validation error if either is missing.
    .option("--label <label>", "Tool label (required by the API, min 1 char)")
    // The values come from the contract, so commander prints and enforces them.
    // The old description typed the five out by hand; two copies of one list is
    // one copy too many, and the hand-typed one is the copy that goes stale.
    .addOption(
      enumOption("--type <type>", "Tool type (required by the API)", TOOL_CREATE__BODY_TYPE)
    )
    .option(
      "--config <json>",
      "Tool configuration as JSON object (becomes the nested config field, provider-specific shape)"
    )
    .option("--fire-and-forget", "Trigger and end the turn — the agent never sees the result")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool create 11111111-1111-4111-8111-111111111111 --label "Order lookup" --type WORKFLOW --config '{"workflowId":"8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f"}' --body '{"agentInputSchema":{"order_id":{"type":"string"}}}'
  $ nexus agent-tool create 11111111-1111-4111-8111-111111111111 --label "Send email" --type PLUGIN --config '{"toolId":"6d5c4b3a-2918-4f7e-8d6c-5b4a39281706","action":"gmail-send-email","toolCredentialId":"1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"}' --body '{"agentInputSchema":{}}'
  $ nexus agent-tool create 11111111-1111-4111-8111-111111111111 --body '{"label":"FAQ search","type":"COLLECTION","config":{"collectionId":"3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4"},"agentInputSchema":{}}'
  $ nexus agent-tool create 11111111-1111-4111-8111-111111111111 --label "Nightly sync" --type WORKFLOW --config '{"workflowId":"8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f"}' --body '{"agentInputSchema":{}}' --fire-and-forget

Notes:
  THERE IS NO WEBHOOK TYPE; reach a webhook through a WORKFLOW that has one. The
  types themselves are listed once, on the --type flag, from the contract.
  agentInputSchema is REQUIRED on every create and has no flag of its own, so
  every create carries a --body holding it. Send {} for a tool the agent calls
  with no arguments, or whose inputs come from config.parameters instead.
  KEEP agentInputSchema FLAT — {"city":{"type":"string"}}. A JSON Schema document
  is also accepted, but ONLY when "properties" arrives alongside "type":"object",
  a "required" array or "additionalProperties". A bare {"properties":{…}} falls
  through to the flat branch and stores ONE parameter named "properties", which
  makes the agent stop replying instead of erroring.
  --config IS the nested config object, not a flatten-into-body alias, and every
  id inside it must be a real UUID. It is validated STRICTLY: an unknown key —
  credentialId, workflow, workflowVersionId, a typo — is a 400 naming the key,
  never a silent strip.
  A WORKFLOW config takes config.workflowId (stored internally as config.toolId,
  and read back as workflowId). THE WORKFLOW MUST BE PUBLISHED.

  🚨 TASK AND DOCUMENT_TEMPLATE HAVE NO KEY OF THEIR OWN — BOTH USE
  config.toolId, AND THE OBVIOUS SPELLING IS A 400. The config schema is strict
  and declares exactly six keys: toolId, workflowId, collectionId, action,
  toolCredentialId, instructions (plus parameters). "taskId" and
  "documentTemplateId" are not among them, so guessing either is refused by
  name. WORKFLOW is the only type with a renamed field; every other type puts
  its target id in the generic toolId:
    --type TASK               --config '{"toolId":"<ai-task-id>"}'
    --type DOCUMENT_TEMPLATE  --config '{"toolId":"<document-template-id>"}'
    --type COLLECTION         --config '{"collectionId":"<collection-id>"}'
  The ids come from "nexus task list" and "nexus template list". A TASK tool
  takes an agentInputSchema like any other; the workflow-trigger rule below
  applies to WORKFLOW only, because only a workflow publishes a contract to
  check against.
  ON A WORKFLOW TOOL, EVERY agentInputSchema NAME MUST ALREADY EXIST ON THE
  PUBLISHED WORKFLOW'S AGENT INPUT TRIGGER. Inventing one is a 400 naming the
  parameter; declaring FEWER than the trigger accepts is fine and normal.
  Read the accepted names first — they are the keys of
  "nexus workflow get <workflowId> --json" → .agentInputSchema, which the
  workflow derives from its agentInputTrigger node's data.parameters at publish.
  A workflow with NO agent input trigger accepts nothing, so the only schema it
  takes is {}.
  THE CHECK IS SILENT WHEN IT CANNOT SEE A CONTRACT — an unpublished workflow,
  or one that has never been published, is accepted with any schema you like and
  the mismatch surfaces later, so publish before you attach.
  THE WHOLE ORDER, FOR A WORKFLOW TOOL: publish the workflow → read
  .agentInputSchema off "workflow get" → create the config with exactly those
  names (or {}) → confirm with "agent-tool get". Skipping step 2 is what turns
  step 3 into a 400.
  A PLUGIN config REQUIRES config.toolId, and the credential goes in
  config.toolCredentialId. CREDENTIAL IDS ARE PER-TOOL: take the id from
  "nexus tool credentials <toolId>" for THIS tool — an id from another tool's
  list is not found.
  --fire-and-forget ENDS THE AGENT'S TURN AT THE CALL. The model receives only
  "Tool … has been triggered successfully", never the output, so never use it for
  a tool whose result the agent has to read. Off by default.
  The API answers 201 with the full config, but this command prints only the id
  and the label. Read agentInputSchema back with "nexus agent-tool get" to
  confirm the shape that was actually stored.`
    )
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.label !== undefined) flags.label = opts.label;
        if (opts.type !== undefined) flags.type = opts.type;
        if (opts.fireAndForget) flags.fireAndForget = true;
        // --config is the API's nested `config` field, not a flatten-into-body
        // alias. The original Object.assign behaviour silently sent the keys
        // at the top level, which the schema (config: z.record) rejected.
        if (opts.config) flags.config = JSON.parse(opts.config);

        const body = mergeBodyWithFlags(base, flags);

        const tool = await client.agents.tools.create(
          agentId,
          asRequestBody<CreateAgentToolBody>(body)
        );
        printSuccess("Tool added to agent.", {
          id: tool.id,
          label: tool.label
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = agentTool
    .command("update")
    .description("Update a tool configuration")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .option("--label <label>", "New label")
    // `--type` exists here because the API REQUIRES `type` alongside any `config`
    // update (wholesale-replace semantics, validated against the type). Without
    // this flag, `--config` on its own could only ever produce that 400, so the
    // flag the CLI already shipped was unusable except through --body.
    .addOption(
      enumOption("--type <type>", "Tool type (REQUIRED with --config)", TOOL_UPDATE__BODY_TYPE)
    )
    .option("--config <json>", "Updated configuration as JSON (wholesale replace — send it whole)")
    .option("--fire-and-forget", "Trigger and end the turn — the agent never sees the result")
    .option("--no-fire-and-forget", "Wait for tool execution (default)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --label "Renamed Tool"
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --no-fire-and-forget
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --type WORKFLOW --config '{"workflowId":"8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f"}'
  $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --body '{"type":"WORKFLOW","config":{"workflowId":"8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f"}}'

Notes:
  SEND --type WHENEVER YOU SEND --config. Omitting it is a 400 — "Must include
  \`type\` when updating \`config\`" — because the config shape is validated against
  the type it belongs to.
  --config REPLACES THE STORED CONFIG WHOLESALE. Keys you leave out are gone, so
  read the current config and send it back complete:
    $ cfg=$(nexus agent-tool get 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --json | jq -c '.config')
    # edit $cfg, then:
    $ nexus agent-tool update 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --type WORKFLOW --config "$cfg"
  NEVER SEND agentInputSchema: null HERE. Send {} to fall back to the schema
  derived from config.parameters, or send the schema whole — those are the two
  supported ways to change it. The same flat-vs-wrapped rule as create applies.
  --fire-and-forget ends the agent's turn at the call and hides the tool's output
  from the model; --no-fire-and-forget is the way back to waiting for the result.
  This command prints only the id — confirm with "nexus agent-tool get".`
    )
    .action(async (agentId: string, toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.label !== undefined) flags.label = opts.label;
        if (opts.type !== undefined) flags.type = opts.type;
        if (opts.fireAndForget !== undefined) flags.fireAndForget = opts.fireAndForget;
        // See agent-tool create: --config is the nested API field, not a
        // flatten-into-body alias.
        if (opts.config) flags.config = JSON.parse(opts.config);

        const body = mergeBodyWithFlags(base, flags);

        await client.agents.tools.update(agentId, toolId, asRequestBody<UpdateAgentToolBody>(body));
        printSuccess("Tool updated.", { id: toolId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  const remove = confirmable(agentTool.command("delete"))
    .description("Remove a tool from an agent")
    .argument("<agent-id>", "Agent ID")
    .argument("<tool-id>", "Tool config ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222
  $ nexus agent-tool delete 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Answers 200 with {id, deleted: true}, not 204.
  IT REMOVES THE CONFIG, NOT THE TARGET. The workflow, task, collection or
  credential the config pointed at survives untouched and stays attached to
  whatever else uses it — so this is how you take a capability away from ONE
  agent without affecting any other.`
    )
    .action(async (agentId: string, toolId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        // Name BOTH ids. The route is `agents/<agentId>/tools/<toolId>` and
        // the agent is what decides which tool the server may touch, so a
        // prompt that echoes only the tool cannot show a mismatch back to the
        // operator — the one place a wrong pairing is still catchable by a
        // human before the write happens.
        if (!(await confirmDestructive(`Remove tool ${toolId} from agent ${agentId}?`, opts)))
          return;

        await client.agents.tools.delete(agentId, toolId);
        printSuccess("Tool removed from agent.", { id: toolId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── attach-collection ──────────────────────────────────────────────────
  const attachCollection = agentTool
    .command("attach-collection")
    .description("Attach a knowledge collection to an agent")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--collection-id <id>", "Collection ID")
    .option("--label <label>", "Tool label")
    .option("--instructions <text>", "Usage instructions")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus agent-tool attach-collection 11111111-1111-4111-8111-111111111111 --collection-id 3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4
  $ nexus agent-tool attach-collection 11111111-1111-4111-8111-111111111111 --collection-id 3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4 --label "FAQ Search"
  $ nexus agent-tool attach-collection 11111111-1111-4111-8111-111111111111 --body '{"collectionId":"3c2b1a09-8f7e-4d6c-9b4a-39281706f5e4","instructions":"Search this before answering pricing questions."}'

Notes:
  THE SHORTCUT FOR --type COLLECTION. It writes the config, a single "query"
  parameter the agent fills itself, and the flat agentInputSchema — which is why
  it takes no --config and no schema.
  --collection-id must be a real UUID. A collection in another organization
  answers exactly as a nonexistent one: "Collection <id> not found".
  --label defaults to the collection's display name. A description has no flag —
  send it in --body — and defaults to the collection's own description.
  --instructions is the tool's usage instruction — the text that tells the agent
  WHEN to search this collection. Nothing supplies it for you.`
    )
    .action(async (agentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.collectionId !== undefined && { collectionId: opts.collectionId }),
          ...(opts.label !== undefined && { label: opts.label }),
          ...(opts.instructions !== undefined && { instructions: opts.instructions })
        });

        const tool = await client.agents.tools.attachCollection(
          agentId,
          asRequestBody<AttachCollectionBody>(body)
        );
        printSuccess("Collection attached to agent.", {
          id: tool.id,
          label: tool.label
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, TOOL_LIST_CONTRACT);
  bindCommand(get, TOOL_GET_CONTRACT);
  bindCommand(create, TOOL_CREATE_CONTRACT);
  bindCommand(update, TOOL_UPDATE_CONTRACT);
  bindCommand(remove, TOOL_DELETE_CONTRACT);
  bindCommand(attachCollection, TOOL_ATTACH_COLLECTION_CONTRACT);
}
