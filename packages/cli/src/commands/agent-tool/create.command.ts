import type { CreateAgentToolBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { TOOL_CREATE__BODY_TYPE, TOOL_CREATE_CONTRACT } from "../agent-tool.contract.generated";

const CREATE_HELP = `
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
  EVERY config.parameters ENTRY WITH handler "prompt" MUST APPEAR IN
  agentInputSchema UNDER ITS OWN NAME, or the create is a 400 naming it. A prompt
  parameter is filled by the AGENT, and the only thing that advertises it is the
  schema — so one the schema never mentions is unfillable: the skill runs with it
  empty and still reports success. That is how an object parameter described by a
  prompt ("build the row from topic, question, …") inserted an all-null row at
  201. The prompt is guidance for filling THAT parameter, never an instruction to
  assemble it out of other inputs. Two ways to satisfy it: name the parameter in
  agentInputSchema, or send {} and let the platform compute the schema from
  config.parameters. Parameters with handler "manual" are supplied from the
  config and are NOT expected in the schema.
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
  list is not found. The UNIFIED id from "nexus credential list" also resolves
  here, for the same connected account.
  --fire-and-forget ENDS THE AGENT'S TURN AT THE CALL. The model receives only
  "Tool … has been triggered successfully", never the output, so never use it for
  a tool whose result the agent has to read. Off by default.
  The API answers 201 with the full config, but this command prints only the id
  and the label. Read agentInputSchema back with "nexus agent-tool get" to
  confirm the shape that was actually stored.`;

/** `nexus agent-tool create` */
export function registerAgentToolCreateCommand(agentTool: Command, program: Command): void {
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
    .addHelpText("after", CREATE_HELP)
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

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(create, TOOL_CREATE_CONTRACT);
}
