import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_INVALID_ARGUMENTS, invalidInput } from "../../errors";
import { EXIT_CODES } from "../../exit-codes";
import { setJsonMode } from "../../output";

/**
 * A CATEGORIZED REFUSAL OUT OF `runLogin` KEEPS ITS OWN EXIT CODE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `login.command.ts`'s CATCH RESTAMPED EVERY THROW AS `local-failed`, SO A
 *    DOCUMENT SAYING ONE THING EXITED ANOTHER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The prompter's refusal for an unseeable question is an `invalid-input` throw
 * carrying its own code — `login-prompts-are-never-invisible.test.ts` pins the
 * error. The catch here is the other half of the chain: one blanket
 * `reportFailure("local-failed", err.message)` gave it exit `9` under a document
 * whose own `code` said the invocation was refused, which is the exact
 * disagreement `apps-spend-refusal-exits-the-code-its-document-names` closed one
 * surface over. A caller branching on the status and a caller branching on the
 * document would read the same refusal two different ways.
 *
 * The arms come in a PAIR and the second is what makes the first mean anything:
 * widening a catch is only correct if the ordinary path still lands on
 * `local-failed`. An `instanceof` branch that swallowed everything would satisfy
 * the first arm alone.
 */

const { runLogin } = vi.hoisted(() => ({ runLogin: vi.fn() }));
vi.mock("./login.run", () => ({ runLogin }));

/**
 * The prompter is stubbed because this file is about the CATCH, not the ask: a
 * real one would open readline against the test runner's own stdin. Its refusal
 * is pinned by the sibling spec, which uses the real prompter.
 */
vi.mock("./login.prompter", () => ({
  createPrompter: (): { ask: () => Promise<string>; close: () => void } => ({
    ask: (): Promise<string> => Promise.resolve(""),
    close: (): void => undefined
  })
}));

import { registerAuthLoginCommand } from "./login.command";

async function runLoginCommand(): Promise<void> {
  const program = new Command();
  program.exitOverride();
  const auth = program.command("auth");
  registerAuthLoginCommand(auth, program);
  await program.parseAsync(["auth", "login"], { from: "user" });
}

describe("a categorized refusal out of the login run keeps its own exit code", () => {
  const exitCodeWas = process.exitCode;
  let documents: string[] = [];

  beforeEach(() => {
    runLogin.mockReset();
    documents = [];
    process.exitCode = undefined;
    setJsonMode(true);
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]): void => {
      documents.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = exitCodeWas;
    setJsonMode(false);
  });

  it("exits the code the refusal declares, not local-failed", async () => {
    runLogin.mockRejectedValue(
      invalidInput(
        "Paste your API key — refusing with nowhere to show the question.",
        "Use --api-key"
      )
    );

    await runLoginCommand();

    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("CONTROL: an ordinary failure is still local-failed, so the widening is not a catch-all", async () => {
    // Without this, `instanceof` replaced by `true` would pass the arm above and
    // give every config-write and browser-spawn failure the invocation's code.
    runLogin.mockRejectedValue(new Error("config write failed"));

    await runLoginCommand();

    expect(process.exitCode).toBe(EXIT_CODES["local-failed"]);
  });

  /**
   * ⚠️ ONE COMMAND PER ARM, and that is a property of the CLI rather than a
   * convenience. `emitDocument` latches: the first document claims stdout and
   * every later one is diverted to stderr, so two commands in one process cannot
   * both be read off stdout. `setJsonMode` clears the latch and its own docblock
   * names itself the run boundary for exactly this reason. An arm that drove two
   * commands and parsed both captures read the second as a command printing
   * nothing at all — measured here, as `Unexpected end of JSON input`.
   */
  function codeOnStdout(): string {
    const parsed: unknown = JSON.parse(documents.join("\n"));
    return String((parsed as { error?: { code?: string } }).error?.code ?? "");
  }

  it("puts the refusal's OWN code in the document on stdout", async () => {
    setJsonMode(true);
    runLogin.mockRejectedValue(invalidInput("refusing with nowhere to show the question.", "x"));

    await runLoginCommand();

    // POSITIVE FIRST: an empty capture satisfies any inequality claim, and is
    // what a diverted document or a broken console.log swap both produce.
    expect(documents.join("\n")).not.toBe("");
    expect(codeOnStdout()).toBe(CLI_INVALID_ARGUMENTS);
  });

  it("CONTROL: an ordinary failure's document does NOT carry the invocation's code", async () => {
    // The pair, over the same field: without it, `toBe(CLI_INVALID_ARGUMENTS)`
    // above is equally satisfied by a catch that stamped every failure with it.
    setJsonMode(true);
    runLogin.mockRejectedValue(new Error("config write failed"));

    await runLoginCommand();

    expect(documents.join("\n")).not.toBe("");
    expect(codeOnStdout()).not.toBe(CLI_INVALID_ARGUMENTS);
  });
});
