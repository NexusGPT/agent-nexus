import { GoldenConversationsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../../../exit-codes";
import { setJsonMode } from "../../../output";

/**
 * `eval conv` REFUSES AN UNREADABLE `--file` / `--criteria` WITH AN EXIT CODE.
 *
 * 🔴 `readFileArg` used to call `refuse(...)` bare and throw the returned code
 * away, so all three verbs printed a refusal and exited 0 — a script branching
 * on the process status read a rejected invocation as a success. One helper,
 * three verbs, one hole.
 *
 * ⚠️ `expect(process.exitCode).not.toBe(0)` CANNOT CATCH THAT. `process.exitCode`
 * is `undefined` until something sets it and `undefined !== 0`, so the loose arm
 * passes on the broken bytes. Every arm below SEEDS `0` first and PINS the code.
 *
 * ⚠️ One arm per `it`, not three in one: a failing assertion throws and aborts
 * the rest of its own block, so a shared block would score exactly one of them.
 */

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../../client", () => ({
  createClient: () => ({
    goldenConversations: new GoldenConversationsResource({ request } as never)
  })
}));

import { registerEvalCommands } from "../../eval";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerEvalCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const CONV = "33333333-3333-4333-8333-333333333333";
/** A path nothing creates, so the refusal is the only reachable branch. */
const ABSENT = "/nonexistent/eval-conv-file-arg-refusal.json";

beforeEach(() => {
  request.mockReset();
  process.exitCode = 0;
});

describe("eval conv — an unreadable file argument carries the invalid-input exit code", () => {
  it("accept --file refuses before reaching the API", async () => {
    await run(["eval", "conv", "accept", "--conversation-id", CONV, "--file", ABSENT]);
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    process.exitCode = 0;
  });

  it("accept --file sends no request when the file is unreadable", async () => {
    await run(["eval", "conv", "accept", "--conversation-id", CONV, "--file", ABSENT]);
    expect(request).not.toHaveBeenCalled();
    process.exitCode = 0;
  });

  it("set-golden --file refuses before reaching the API", async () => {
    await run([
      "eval",
      "conv",
      "set-golden",
      "--conversation-id",
      CONV,
      "--index",
      "1",
      "--file",
      ABSENT
    ]);
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    process.exitCode = 0;
  });

  it("set-golden --file sends no request when the file is unreadable", async () => {
    await run([
      "eval",
      "conv",
      "set-golden",
      "--conversation-id",
      CONV,
      "--index",
      "1",
      "--file",
      ABSENT
    ]);
    expect(request).not.toHaveBeenCalled();
    process.exitCode = 0;
  });

  it("checkpoint --criteria refuses before reaching the API", async () => {
    await run([
      "eval",
      "conv",
      "checkpoint",
      "--conversation-id",
      CONV,
      "--index",
      "1",
      "--on",
      "--criteria",
      ABSENT
    ]);
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    process.exitCode = 0;
  });

  it("checkpoint --criteria sends no request when the file is unreadable", async () => {
    await run([
      "eval",
      "conv",
      "checkpoint",
      "--conversation-id",
      CONV,
      "--index",
      "1",
      "--on",
      "--criteria",
      ABSENT
    ]);
    expect(request).not.toHaveBeenCalled();
    process.exitCode = 0;
  });
});
