import { WorkflowsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * GATE B — the in-action `TRIGGER_TYPES.includes` narrow in `workflow trigger`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS, AND WHAT IT DOES *NOT* CLAIM
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--type` carries `enumOption(...)`, which calls commander's `.choices()`. That
 * is GATE A, it refuses at PARSE time, and it is the gate every real invocation
 * meets: `nexus workflow trigger <id> --type webhook` never reaches the action
 * body at all. Measured — the first `describe` below is that measurement, kept
 * here rather than asserted from memory.
 *
 * So the narrow inside the action body is NOT reachable from argv. Deleting it
 * left the entire CLI suite byte-identically green (204 files / 3342 tests,
 * 2026-09-08), because nothing in the suite could distinguish it from absent.
 *
 * 🚨 THIS IS THEREFORE A CONTRACT TEST ON A GUARD AGAINST AN INPUT THE CLI
 *    CANNOT CURRENTLY EMIT, AND IT IS LABELLED AS ONE RATHER THAN LEFT TO BE
 *    READ AS A SYSTEM ARM. The distinction is worth the paragraph: an arm whose
 *    input no real caller can produce says nothing about the running system
 *    however honestly it passes, and it reports the same green as one that
 *    protects something — so a file full of them is indistinguishable, in every
 *    summary and every coverage percentage, from real cover.
 *
 *    What earns this one its place is that the guard defends a real contract.
 *    The line immediately after it is `opts.type as ReplaceTriggerBody["type"]`,
 *    an unchecked widening cast, and the narrow is the only thing that makes
 *    that cast honest. So the value here is NOT that a mistyped `--type` is
 *    caught — gate A catches it, earlier and with a better message — it is that
 *    the narrow can no longer be deleted in silence while the cast stays. Until
 *    this file existed it could: deleting it left every test green.
 *
 * The injection below sets the option value AFTER commander has parsed and
 * validated argv, which is the only way to put a non-member in front of the
 * narrow. It exercises the identical branch a future caller would take if any
 * path ever supplied `opts.type` without going through `.choices()` — a
 * `.env()` binding, a config file, a programmatic driver, or an
 * `enumOption` wrapper someone removes.
 *
 * ⚠️ THE LEGAL-VALUE CONTROL IS LOAD-BEARING. Without it, "the narrow refused"
 * and "the injection never reached the action" are the same observation: both
 * leave the SDK uncalled. The control proves the injected value really does
 * arrive in the action body.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({ workflows: new WorkflowsResource({ request } as never) })
}));

import { WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE } from "./workflow.contract.generated";
import { registerWorkflowBuilderCommands } from "./workflow-builder";

const WF = "11111111-1111-4111-8111-111111111111";

/** Read from the contract, never retyped — the same source the narrow reads. */
const CONTRACT_VALUES = WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE.contractValues;
const LEGAL = "webhookTrigger";

/**
 * Coined, and deliberately not a near-miss of any real value: a token that
 * appears nowhere in the contract, the SDK or the help text, so a hit on it in
 * the refusal cannot have come from anything but the value we injected.
 */
const NOT_A_TRIGGER = "sentinelCoinedNotATriggerType";

/** The legacy token the pre-mission help examples advertised. Gate A's job. */
const LEGACY_TOKEN = "webhook";

let stderr: string[];

/**
 * Drive the REAL command tree.
 *
 * `injectType` installs a `preAction` hook that overwrites `--type` after
 * commander has already accepted a legal one from argv, so gate A is satisfied
 * and gate B is the only thing left standing.
 */
async function run(argv: string[], injectType?: string): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  const workflow = program.command("workflow");
  registerWorkflowBuilderCommands(workflow, program);
  setJsonMode(false);
  if (injectType !== undefined) {
    program.hook("preAction", (_thisCommand, actionCommand) => {
      actionCommand.setOptionValue("type", injectType);
    });
  }
  await program.parseAsync(["node", "nexus", ...argv]);
}

beforeEach(() => {
  vi.clearAllMocks();
  stderr = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  });
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("gate A — commander refuses an out-of-list --type before the action runs", () => {
  it("refuses the legacy `webhook` token at parse time", async () => {
    await expect(run(["workflow", "trigger", WF, "--type", LEGACY_TOKEN])).rejects.toThrow(
      /invalid/i
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("accepts a contract value — so the refusal above is about the VALUE", async () => {
    request.mockResolvedValue({ node: { id: "n1", type: LEGAL }, reconnectedEdges: [] });
    await run(["workflow", "trigger", WF, "--type", LEGAL]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("gate B — the in-action TRIGGER_TYPES narrow", () => {
  it("CONTROL: an injected LEGAL value reaches the action and goes on the wire", async () => {
    // Separates "the narrow refused" from "the injection never arrived". If this
    // arm is red, every verdict in this describe block is meaningless.
    request.mockResolvedValue({ node: { id: "n1", type: LEGAL }, reconnectedEdges: [] });

    await run(["workflow", "trigger", WF, "--type", LEGAL], LEGAL);

    expect(request).toHaveBeenCalledTimes(1);
    // `HttpClient.request(method, path, { body })` — index 2 is the init.
    const [method, path, init] = request.mock.calls[0] as [
      string,
      string,
      { body?: { type?: string } } | undefined
    ];
    expect(method).toBe("PUT");
    expect(path).toContain(`/workflows/${WF}/trigger`);
    expect(init?.body?.type).toBe(LEGAL);
    expect(process.exitCode).toBeUndefined();
  });

  it("refuses a non-member that reaches the action body, and sends NOTHING", async () => {
    request.mockResolvedValue({ node: { id: "n1" }, reconnectedEdges: [] });

    await run(["workflow", "trigger", WF, "--type", LEGAL], NOT_A_TRIGGER);

    // The load-bearing half: the bad value never reaches the API.
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBeGreaterThan(0);
  });

  it("names the value it refused and every value it would accept", async () => {
    request.mockResolvedValue({ node: { id: "n1" }, reconnectedEdges: [] });

    await run(["workflow", "trigger", WF, "--type", LEGAL], NOT_A_TRIGGER);

    // ANCHOR on the narrow's own line before asserting anything about its
    // content: commander's refusal ("option '--type <type>' argument ... is
    // invalid") is on the same channel and would satisfy a loose substring
    // search for the contract values, since `enumOption` renders them too.
    const line = stderr.find((entry) => entry.includes("--type must be one of:"));
    expect(line, `no gate-B refusal on stderr; got:\n${stderr.join("\n")}`).toBeDefined();

    // Assert the PARTS, never the joined list: every contract value is a
    // substring of the rendered `join(", ")`, so asserting the joined string
    // would pass on any subset that happens to be a prefix.
    expect(CONTRACT_VALUES.length).toBeGreaterThan(1);
    for (const value of CONTRACT_VALUES) {
      expect(line).toContain(value);
    }
    expect(line).toContain(NOT_A_TRIGGER);
  });
});
