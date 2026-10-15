import { PromptEvalRunsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../../../exit-codes";
import { setJsonMode } from "../../../output";

/**
 * `eval run create` / `preview` REFUSE WITH AN EXIT CODE, not just a message.
 *
 * 🔴 These arms exist because `refuse(...)` RETURNS the exit code and the call
 * sites used to throw it away. A bare `refuse(...)` prints the refusal and
 * leaves `process.exitCode` untouched, so a failed invocation exited 0 and
 * every script branching on it read the refusal as a success.
 *
 * ⚠️ `expect(process.exitCode).not.toBe(0)` CANNOT CATCH THAT. `process.exitCode`
 * is `undefined` until something sets it and `undefined !== 0`, so the loose arm
 * passes on the broken bytes. Every arm below SEEDS `0` first and PINS the code.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../../client", () => ({
  createClient: () => ({
    promptEvalRuns: new PromptEvalRunsResource({ request } as never)
  })
}));

import { registerEvalRunCommands } from "../../eval-run";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  const evalCmd = program.command("eval");
  registerEvalRunCommands(evalCmd, program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const PREVIEW = {
  agentId: "agent-1",
  caseCount: 1,
  candidates: [{ versionId: "v-1", variantName: "Good" }],
  selection: [{ conversationId: "conv_a", turnIndexes: [1] }],
  warnings: []
};

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(PREVIEW);
  process.exitCode = 0;
});

describe("eval run — a refusal carries the invalid-input exit code", () => {
  it.each([
    ["create", "9"],
    ["create", "0"],
    ["preview", "9"],
    ["preview", "0"]
  ])("%s refuses --repetitions %s before reaching the API", async (verb, repetitions) => {
    await run([
      "eval",
      "run",
      verb,
      "--conversations",
      "conv_a",
      "--variants",
      "Good",
      "--repetitions",
      repetitions
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    process.exitCode = 0;
  });

  it("create refuses a --budget-cap-usd that is not a positive amount", async () => {
    await run([
      "eval",
      "run",
      "create",
      "--conversations",
      "conv_a",
      "--variants",
      "Good",
      "--budget-cap-usd",
      "nonsense"
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    process.exitCode = 0;
  });

  /**
   * ⚠️ PRE-EXISTING AND PINNED RATHER THAN FIXED: `--dry-run` returns before the
   * budget cap is parsed, so a malformed cap is silently ignored on a dry run
   * and refused on a real one. The ORDER of those two blocks is the behaviour,
   * and a reader reorganising the action would otherwise change it in silence.
   */
  it("IGNORES a malformed --budget-cap-usd under --dry-run, and still previews", async () => {
    await run([
      "eval",
      "run",
      "create",
      "--conversations",
      "conv_a",
      "--variants",
      "Good",
      "--budget-cap-usd",
      "nonsense",
      "--dry-run"
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });
});
