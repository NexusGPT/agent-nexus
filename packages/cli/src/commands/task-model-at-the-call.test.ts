import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `task execute --model-name/--model-provider` and `task duplicate` — ASSERTED
 * ON THE REQUEST, not on the exit code (NEX-2962).
 *
 * Two defects sit behind this file. The reported one is that the 409 on `task
 * create` recommended duplicating and `nexus task duplicate <id>` answered
 * `error: unknown command 'duplicate'`. The one the owner asked for is larger:
 * the model was bound to the TASK when it is properly a property of the CALL, so
 * "same prompt, cheaper model for the bulk sweep" could only be said by forking
 * the prompt — and two copies of one prompt drift.
 *
 * Every case inspects the BODY the SDK was handed. A test asserting only that
 * the command exited 0 passes against a `--model-name` flag that is parsed and
 * dropped, which is the exact shape that would silently keep billing the
 * expensive model.
 */

const executed: Array<{ taskId: string; body: Record<string, unknown> }> = [];
const duplicated: Array<{ taskId: string; body: Record<string, unknown> }> = [];

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({
      skills: {
        executeTask: (taskId: string, body: Record<string, unknown>) => {
          executed.push({ taskId, body });
          return Promise.resolve({ output: "ok", outputType: "TEXT" });
        },
        duplicateTask: (taskId: string, body: Record<string, unknown>) => {
          duplicated.push({ taskId, body });
          return Promise.resolve({
            id: "copy-1",
            name: "a copy",
            modelName: "claude-haiku-4-5",
            modelProvider: "ANTHROPIC"
          });
        }
      }
    })
  };
});

import { registerTaskCommands } from "./task";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

/** The stderr the CLI printed, so a refusal can be asserted on its wording. */
async function run(argv: string[]): Promise<{ errors: string[]; exitCode: number | undefined }> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON");
  registerTaskCommands(program);

  const errors: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errSpy = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => void errors.push(args.join(" ")));
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return { errors, exitCode: process.exitCode };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = undefined;
  }
}

beforeEach(() => {
  executed.length = 0;
  duplicated.length = 0;
});

describe("task execute", () => {
  it("sends a modelOverride when both model flags are given", async () => {
    await run([
      "task",
      "execute",
      TASK_ID,
      "--input",
      "a notice",
      "--model-name",
      "claude-haiku-4-5",
      "--model-provider",
      "ANTHROPIC"
    ]);

    expect(executed).toHaveLength(1);
    expect(executed[0].body).toEqual({
      input: "a notice",
      modelOverride: { modelName: "claude-haiku-4-5", modelProvider: "ANTHROPIC" }
    });
  });

  it("carries a custom endpoint into the override when one is named", async () => {
    await run([
      "task",
      "execute",
      TASK_ID,
      "--input",
      "x",
      "--model-name",
      "llama-3.3-70b",
      "--model-provider",
      "OPEN_AI",
      "--custom-model-id",
      "22222222-2222-4222-8222-222222222222"
    ]);

    expect(executed[0].body.modelOverride).toMatchObject({
      customModelId: "22222222-2222-4222-8222-222222222222"
    });
  });

  it("sends NO modelOverride key when neither flag is given", async () => {
    // The control. An empty `modelOverride: {}` is a different request and the
    // server refuses it for a missing modelName, so "absent" has to mean absent.
    await run(["task", "execute", TASK_ID, "--input", "x"]);

    expect(executed[0].body).toEqual({ input: "x" });
    expect(executed[0].body).not.toHaveProperty("modelOverride");
  });

  it("refuses half a routing pair before sending anything", async () => {
    const { errors, exitCode } = await run([
      "task",
      "execute",
      TASK_ID,
      "--input",
      "x",
      "--model-name",
      "claude-haiku-4-5"
    ]);

    // Not "the server 400s": completing the pair from the task's own provider
    // would address an OpenAI endpoint with an Anthropic model id, so the
    // refusal has to happen with no request in flight.
    expect(executed).toHaveLength(0);
    expect(exitCode).not.toBe(0);
    expect(errors.join("\n")).toContain("--model-provider");
  });

  it("takes a modelOverride through --body for the tuning that has no flag", async () => {
    await run([
      "task",
      "execute",
      TASK_ID,
      "--input",
      "x",
      "--body",
      '{"modelOverride":{"modelName":"gpt-5","modelProvider":"OPEN_AI","reasoningEffort":"low"}}'
    ]);

    expect(executed[0].body.modelOverride).toEqual({
      modelName: "gpt-5",
      modelProvider: "OPEN_AI",
      reasoningEffort: "low"
    });
  });
});

describe("task duplicate", () => {
  it("exists — the command the 409 on `task create` recommends", async () => {
    const { errors } = await run(["task", "duplicate", TASK_ID]);

    // The reported symptom, in the terms it was reported in.
    expect(errors.join("\n")).not.toContain("unknown command");
    expect(duplicated).toHaveLength(1);
    expect(duplicated[0].taskId).toBe(TASK_ID);
  });

  it("sends an empty body for a plain copy, naming nothing it was not told", async () => {
    await run(["task", "duplicate", TASK_ID]);

    expect(duplicated[0].body).toEqual({});
  });

  it("forks by model alone without re-sending the prompt", async () => {
    // The whole point: the caller names a model and a name, and the 94,268-char
    // prompt never crosses the wire — so it cannot arrive subtly different.
    await run([
      "task",
      "duplicate",
      TASK_ID,
      "--name",
      "Assessor (haiku)",
      "--model-name",
      "claude-haiku-4-5",
      "--model-provider",
      "ANTHROPIC"
    ]);

    expect(duplicated[0].body).toEqual({
      name: "Assessor (haiku)",
      modelName: "claude-haiku-4-5",
      modelProvider: "ANTHROPIC"
    });
    expect(duplicated[0].body).not.toHaveProperty("prompt");
  });
});
