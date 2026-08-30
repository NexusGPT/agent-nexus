import assert from "node:assert/strict";

import { DbEnum, NodeType } from "@nexus/types";
import {
  AGENT_TOOL_CONFIG_TYPES_NOT_WRITABLE_VIA_V1,
  AgentToolConfigTypeSchema,
  ApiTriggerTypeSchema,
  BatchRequestBodySchema,
  ConversationEvalRunStatusSchema,
  CreateAgentToolBodySchema,
  CreateEdgeBodySchema,
  ExecutionStatusSchema,
  ListWorkflowsParamsSchema,
  UpdateAgentToolBodySchema,
  UpsertConversationEvalWebhookBodySchema,
  WritableAgentToolConfigTypeSchema
} from "@nexus/types/public-api-v1";
import { Command } from "commander";
import { test } from "vitest";

import { registerAgentCommands } from "../../src/commands/agent";
import { registerAgentEvalCommands } from "../../src/commands/agent-eval";
import { registerAgentToolCommands } from "../../src/commands/agent-tool";
import { registerExecutionCommands } from "../../src/commands/execution";
import { registerWorkflowCommands } from "../../src/commands/workflow";

/**
 * THE HELP-IS-TRUE GATE for the agent-authoring namespaces (NEX-3626).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A TEST GUARDS PROSE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * NEX-3626 makes `--help` the authoritative statement of each command's contract,
 * which turns every sentence in it into something that can be WRONG. The
 * expensive kind of wrong is an EXAMPLE: a reader copies it, the API refuses it,
 * and the help that was meant to make the command usable first time is what broke
 * the attempt. Not hypothetical — every case pinned below shipped:
 *
 *   · `agent-tool create --help` advertised `--type WEBHOOK`, absent from
 *     `AgentToolConfigTypeSchema`, and its first two examples omitted the
 *     REQUIRED `agentInputSchema`, so both were a 400.
 *   · its ids (`wf-789`, `col-1`) are not UUIDs, which `ToolConfigSchema` demands.
 *   · `workflow edge create --help` passed `{"type":"conditional"}`; the enum is
 *     main | rewind.
 *   · `workflow batch --help` declared `{"ref":"@n1","type":"llm"}` — a ref is
 *     declared BARE and referenced as `@ref`, and `llm` is not in `NodeType`.
 *   · `workflow node create --help` used `--type action`, also not a node type.
 *   · `agent create/update --help` advertised `--tone`, which
 *     `rejectDeprecatedPromptFields` refuses with a 400 before Zod runs.
 *
 * So these assertions read the SHIPPED contracts rather than restating them: a
 * type added to an enum, or a field becoming required, reddens the help that
 * describes it. Hard-coded expectations would drift in step with the prose they
 * are meant to police.
 *
 * ── Why this file lives in `test/unit/` and not beside the commands ──────────
 *
 * `wire-types-bundle.test.ts` forbids `@nexus/types` in ANY `src/` module that is
 * not a `.conformance.ts` gate: the package pulls Zod and the generated Prisma
 * enums, and the CLI publishes standalone. Reading the real contracts is the
 * whole point of this file, so it belongs outside `src/`. `vitest.config.ts`
 * includes the `test/` tree alongside the `src/` one, so living outside `src/`
 * costs it nothing: one runner reaches both.
 */

type Register = (program: Command) => void;

/**
 * The help text one command would print, without printing it.
 *
 * `outputHelp()`, not `helpInformation()`: every Notes / Examples block in this
 * CLI is an `addHelpText("after", …)` hook, and those are appended by the OUTPUT
 * path only. `helpInformation()` returns the generated usage/options section
 * alone, so asserting against it would pass while saying nothing about the prose.
 */
function helpFor(register: Register, path: string[]): string {
  const program = new Command();
  program.name("nexus").exitOverride();
  register(program);

  let cmd: Command | undefined = program;
  for (const name of path) {
    cmd = cmd?.commands.find((c) => c.name() === name);
    assert.ok(cmd, `command "${path.join(" ")}" is registered`);
  }

  let captured = "";
  cmd.configureOutput({
    writeOut: (str) => {
      captured += str;
    }
  });
  cmd.outputHelp();
  return captured;
}

/** The subcommands of one group, minus commander's own `help`. */
function subcommandsOf(register: Register, group: string): Command[] {
  const program = new Command();
  register(program);
  const cmd = program.commands.find((c) => c.name() === group) as Command;
  return cmd.commands.filter((c) => c.name() !== "help");
}

/** Every `$ nexus …` example line in a help block. */
function examplesIn(help: string): string[] {
  return help
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("$ nexus "));
}

/** The JSON objects embedded in one example line, in order. */
function jsonPayloadsIn(example: string): unknown[] {
  return [...example.matchAll(/'(\{.*?\})'(?=\s|$)/g)].map(([, json]) => JSON.parse(json));
}

// ── agent ─────────────────────────────────────────────────────────────────

test("agent --help does not advertise a removed field as a flag", () => {
  // `rejectDeprecatedPromptFields` throws 400 DEPRECATED_FIELDS for each of these
  // BEFORE Zod runs, so a flag spelling any of them could only ever produce a
  // failed request. `--tone` was one, and is gone.
  for (const sub of ["create", "update"]) {
    const help = helpFor(registerAgentCommands, ["agent", sub]);
    const flags = help.slice(0, help.indexOf("Examples:"));
    for (const removed of ["--tone", "--objective", "--behaviour", "--explanation"]) {
      assert.ok(!flags.includes(removed), `agent ${sub} advertises ${removed}`);
    }
  }
});

test("agent --help names the removed fields, so a caller knows not to send them", () => {
  for (const sub of ["create", "update"]) {
    const help = helpFor(registerAgentCommands, ["agent", sub]);
    assert.ok(help.includes("DEPRECATED_FIELDS"), `agent ${sub} omits the error code`);
    for (const field of ["objective", "tone", "explanation", "behaviour"]) {
      assert.ok(help.includes(field), `agent ${sub} omits removed field ${field}`);
    }
  }
});

test("every agent subcommand has an Examples block", () => {
  for (const sub of subcommandsOf(registerAgentCommands, "agent")) {
    const help = helpFor(registerAgentCommands, ["agent", sub.name()]);
    assert.notEqual(examplesIn(help).length, 0, `agent ${sub.name()} has no example`);
  }
});

// ── agent-tool ────────────────────────────────────────────────────────────

/**
 * 🚨 THE ENUM TO READ HERE IS THE **WRITE** ONE, AND READING THE WRONG ONE FAILS
 * IN BOTH DIRECTIONS.
 *
 * `AgentToolConfigTypeSchema` is the READ enum — it types the response DTO, so it
 * must name every type a stored row can hold. `WritableAgentToolConfigTypeSchema`
 * is what the create and update BODIES accept, and it is strictly narrower:
 * `AGENT_TOOL_CONFIG_TYPES_NOT_WRITABLE_VIA_V1` holds back types with no equip
 * surface behind them.
 *
 * This test asserted against the read enum and went red the hour `MEMORY` was
 * added to it — `create --help omits type MEMORY` — for a value `create` must
 * never offer. Satisfying that by listing MEMORY in the help would have made
 * `--help` advertise a `--type` the API now refuses, which is the exact class of
 * defect this whole file exists to catch.
 *
 * The second arm is the one that keeps the split honest in the other direction:
 * a withheld type must be ABSENT from the write help. Without it, deleting the
 * exclusion list would leave every assertion here green.
 */
test("agent-tool create --help lists exactly the tool types the contract accepts", () => {
  const help = helpFor(registerAgentToolCommands, ["agent-tool", "create"]);

  for (const type of WritableAgentToolConfigTypeSchema.options) {
    assert.ok(help.includes(type), `create --help omits writable type ${type}`);
  }
  for (const type of AGENT_TOOL_CONFIG_TYPES_NOT_WRITABLE_VIA_V1) {
    assert.ok(
      !new RegExp(`--type ${type}\\b`).test(help),
      `create --help offers --type ${type}, which the API refuses`
    );
  }
  // The exclusion is real and not an empty list quietly satisfying both arms.
  assert.ok(
    AGENT_TOOL_CONFIG_TYPES_NOT_WRITABLE_VIA_V1.length > 0 &&
      WritableAgentToolConfigTypeSchema.options.length < AgentToolConfigTypeSchema.options.length,
    "the write enum is not narrower than the read enum — the split is inert"
  );
  // WEBHOOK was in the shipped help and its fourth example. It is not a type.
  assert.ok(!AgentToolConfigTypeSchema.options.includes("WEBHOOK" as never));
  for (const example of examplesIn(help)) {
    assert.ok(
      !/--type WEBHOOK\b/.test(example),
      `example uses a type outside the enum: ${example}`
    );
  }
});

/**
 * The read half of the same split, asserted where the write half is asserted so
 * the two cannot drift apart unnoticed.
 *
 * A withheld type must still be READABLE: `AgentToolConfigSchema.type` is the
 * response DTO, and dropping a member from it makes an existing row of that type
 * unserialisable — a 500 on a GET, strictly worse than being unwritable. That is
 * the whole reason this is a split rather than a narrowing.
 */
test("a type withheld from the write surface is still readable on the response", () => {
  for (const type of AGENT_TOOL_CONFIG_TYPES_NOT_WRITABLE_VIA_V1) {
    assert.ok(
      AgentToolConfigTypeSchema.options.includes(type),
      `${type} is excluded from writes but also missing from the read enum — a GET on such a row cannot be serialised`
    );
    assert.equal(
      UpdateAgentToolBodySchema.safeParse({ type }).success,
      false,
      `update accepts type ${type}, which the exclusion list says it refuses`
    );
  }
});

test("agent-tool create --help ships examples the API would accept", () => {
  for (const example of examplesIn(helpFor(registerAgentToolCommands, ["agent-tool", "create"]))) {
    // Rebuild the body the example produces: flags carry label/type, and the JSON
    // payloads carry config and agentInputSchema.
    const body: Record<string, unknown> = {};
    const label = /--label "([^"]+)"/.exec(example);
    const type = /--type (\w+)/.exec(example);
    if (label) body.label = label[1];
    if (type) body.type = type[1];

    const payloads = jsonPayloadsIn(example);
    // `--config '<json>'` comes first when present, then `--body '<json>'`.
    if (/--config /.test(example)) body.config = payloads.shift();
    for (const rest of payloads) Object.assign(body, rest as Record<string, unknown>);

    const parsed = CreateAgentToolBodySchema.safeParse(body);
    assert.ok(
      parsed.success,
      `example is refused by CreateAgentToolBodySchema: ${example}\n${JSON.stringify(parsed.error?.issues)}`
    );
  }
});

test("agent-tool create --help names the credential field the API actually reads", () => {
  // `ToolConfigSchema` is `.strict()`, so `credentialId` is a 400 rather than a
  // silent drop. The help has to name `toolCredentialId`.
  const help = helpFor(registerAgentToolCommands, ["agent-tool", "create"]);
  assert.ok(help.includes("toolCredentialId"));
});

test("agent-tool update offers --type, the field the API refuses a config without", () => {
  const help = helpFor(registerAgentToolCommands, ["agent-tool", "update"]);
  assert.ok(help.includes("--type"), "update has no --type flag, so --config can only 400");

  // The real contract, not a restatement: `type` is what makes a `config` update
  // parse at all, and the CLI now has a flag for it.
  const config = { workflowId: "8f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f" };
  assert.equal(UpdateAgentToolBodySchema.safeParse({ type: "WORKFLOW", config }).success, true);
  assert.equal(UpdateAgentToolBodySchema.safeParse({ config }).success, false);
});

// ── workflow ──────────────────────────────────────────────────────────────

const NODE_TYPES = new Set(Object.values(NodeType) as string[]);

test("workflow --help names only registered node types in its examples", () => {
  // `llm`, `action` and `condition` all shipped in examples. None is a node type,
  // so each was a 400 NODE_TYPE_INVALID for anyone who copied it.
  for (const path of [["node", "create"], ["node-type"]]) {
    for (const example of examplesIn(helpFor(registerWorkflowCommands, ["workflow", ...path]))) {
      const type = /--type (\w+)/.exec(example) ?? /node-type (\w+)/.exec(example);
      if (!type) continue;
      assert.ok(NODE_TYPES.has(type[1]), `example names unregistered node type: ${example}`);
    }
  }
});

test("workflow batch --help ships examples the contract accepts, with real node types", () => {
  for (const example of examplesIn(helpFor(registerWorkflowCommands, ["workflow", "batch"]))) {
    for (const payload of jsonPayloadsIn(example)) {
      const parsed = BatchRequestBodySchema.safeParse(payload);
      assert.ok(
        parsed.success,
        `batch example refused by BatchRequestBodySchema: ${example}\n${JSON.stringify(parsed.error?.issues)}`
      );

      for (const node of parsed.data?.nodes ?? []) {
        assert.ok(
          NODE_TYPES.has(node.type),
          `batch example names unregistered type '${node.type}'`
        );
        // A ref is DECLARED bare and REFERENCED with "@". The shipped example
        // declared "@n1", which nothing could then resolve by "@n1".
        assert.equal(node.ref.startsWith("@"), false, `declared ref is @-prefixed: ${node.ref}`);
      }
      for (const edge of parsed.data?.edges ?? []) {
        assert.equal(CreateEdgeBodySchema.safeParse(edge).success, true);
      }
    }
  }
});

test("workflow --help ships edge and trigger examples whose enum values exist", () => {
  for (const example of examplesIn(
    helpFor(registerWorkflowCommands, ["workflow", "edge", "create"])
  )) {
    for (const payload of jsonPayloadsIn(example)) {
      // `conditional` shipped here and is not an edge type.
      const parsed = CreateEdgeBodySchema.safeParse({
        source: "a",
        target: "b",
        ...(payload as object)
      });
      assert.ok(parsed.success, `edge example refused: ${example}`);
    }
  }

  for (const example of examplesIn(helpFor(registerWorkflowCommands, ["workflow", "trigger"]))) {
    const type = /--type (\w+)/.exec(example);
    if (!type) continue;
    assert.ok(
      (ApiTriggerTypeSchema.options as string[]).includes(type[1]),
      `unknown trigger type: ${example}`
    );
  }
});

test("workflow list --help states the status enum in full, ARCHIVED included", () => {
  const help = helpFor(registerWorkflowCommands, ["workflow", "list"]);
  for (const status of ListWorkflowsParamsSchema.shape.status.unwrap().options as string[]) {
    assert.ok(help.includes(status), `workflow list --help omits status ${status}`);
  }
});

// ── execution ─────────────────────────────────────────────────────────────

test("execution --help states both status enums, and keeps them apart", () => {
  // The two enums are genuinely different and the difference is a trap: a failed
  // NODE is ERROR, while a failed EXECUTION is FAILED. Reading them from the
  // contract is what stops the help drifting into one merged list.
  const groupHelp = helpFor(registerExecutionCommands, ["execution"]);
  for (const status of ExecutionStatusSchema.options) {
    assert.ok(groupHelp.includes(status), `execution --help omits execution status ${status}`);
  }
  for (const status of DbEnum.NODE_STATE_VALUES) {
    assert.ok(groupHelp.includes(status), `execution --help omits node status ${status}`);
  }
  assert.ok(!(DbEnum.NODE_STATE_VALUES as readonly string[]).includes("FAILED"));
  assert.ok((ExecutionStatusSchema.options as string[]).includes("FAILED"));

  const listHelp = helpFor(registerExecutionCommands, ["execution", "list"]);
  for (const status of ExecutionStatusSchema.options) {
    assert.ok(listHelp.includes(status), `execution list --help omits ${status}`);
  }

  // node-result reports the NODE enum, so its help has to carry that one.
  const nodeResultHelp = helpFor(registerExecutionCommands, ["execution", "node-result"]);
  for (const status of DbEnum.NODE_STATE_VALUES) {
    assert.ok(nodeResultHelp.includes(status), `execution node-result --help omits ${status}`);
  }
});

test("every execution subcommand has an Examples block", () => {
  for (const sub of subcommandsOf(registerExecutionCommands, "execution")) {
    const help = helpFor(registerExecutionCommands, ["execution", sub.name()]);
    assert.notEqual(examplesIn(help).length, 0, `execution ${sub.name()} has no example`);
  }
});

// ── agent-eval ────────────────────────────────────────────────────────────

test("every agent-eval leaf subcommand has an Examples block", () => {
  // This namespace shipped with no Examples and no Notes anywhere, across six
  // groups. The bar is per-leaf: `agent-eval run create` is where a caller lands.
  for (const group of subcommandsOf(registerAgentEvalCommands, "agent-eval")) {
    for (const leaf of group.commands.filter((c) => c.name() !== "help")) {
      const help = helpFor(registerAgentEvalCommands, ["agent-eval", group.name(), leaf.name()]);
      assert.notEqual(
        examplesIn(help).length,
        0,
        `agent-eval ${group.name()} ${leaf.name()} has no example`
      );
    }
  }
});

test("agent-eval run list --help states the whole run-status enum", () => {
  // A two-state poll (COMPLETED / FAILED) never terminates on a run that stops at
  // TIMED_OUT or BUDGET_EXCEEDED, so the help has to name all twelve.
  const help = helpFor(registerAgentEvalCommands, ["agent-eval", "run", "list"]);
  for (const status of ConversationEvalRunStatusSchema.options) {
    assert.ok(help.includes(status), `run list --help omits status ${status}`);
  }
});

test("agent-eval webhook upsert --help names the event enum exactly", () => {
  const help = helpFor(registerAgentEvalCommands, ["agent-eval", "webhook", "upsert"]);
  const events = UpsertConversationEvalWebhookBodySchema.shape.events.element.options as string[];
  assert.ok(events.length > 0, "events enum was not readable from the contract");
  for (const event of events) {
    assert.ok(help.includes(event), `webhook upsert --help omits event ${event}`);
  }
});

test("every agent-eval destructive verb documents the refusal contract", () => {
  // The behaviour a script author has to know BEFORE running one of these: with
  // no terminal and no --yes the command refuses and exits non-zero. A help page
  // that omits it leaves the reader to discover the refusal from a failed run.
  //
  // Six leaves, not five: `template detach` is destructive too and was the one
  // this check used to miss.
  const DESTRUCTIVE = [
    ["run", "delete"],
    ["template", "delete"],
    ["template", "detach"],
    ["schedule", "delete"],
    ["trigger", "delete"],
    ["webhook", "delete"]
  ];

  for (const path of DESTRUCTIVE) {
    const help = helpFor(registerAgentEvalCommands, ["agent-eval", ...path]);
    assert.match(
      help,
      /--yes IS REQUIRED IN A SCRIPT/,
      `agent-eval ${path.join(" ")} does not state that --yes is required in a script`
    );
    assert.match(
      help,
      /REFUSES/,
      `agent-eval ${path.join(" ")} does not say it refuses with no terminal`
    );
    // The example is what a reader copies. Without a --yes line they copy the
    // interactive form into a script and it refuses.
    assert.ok(
      examplesIn(help).some((example) => example.includes("--yes")),
      `agent-eval ${path.join(" ")} has no --yes example to copy into a script`
    );
  }
});
