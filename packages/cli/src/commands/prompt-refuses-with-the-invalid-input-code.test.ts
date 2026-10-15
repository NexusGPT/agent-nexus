import { PromptVariantsResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";

/**
 * `nexus prompt save` REFUSES WITH THE INVALID-INPUT CODE, NOT WITH 0.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT, AND WHY NO EXISTING ARM COULD SEE IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `refuse()` RETURNS the invalid-input exit code; it does not set it. The three
 * refusals behind `--file`/`--text` called it BARE — `refuse(...)` with the
 * return value dropped — so a malformed invocation printed a correct refusal
 * document and exited **0**. Pre-existing from the pre-split bytes; the split is
 * what put the helper somewhere a spec could name.
 *
 * 🔴 `prompt-variant.test.ts` asserts a local refusal by "the transport stayed
 * silent", which is TRUE of a refusal that sets the code and equally true of one
 * that does not. The exit code is the only field that separates them, and no arm
 * in this package read it on these three paths. So the stdout half was already
 * covered and the half a script branches on was not.
 *
 * ⚠️ EACH ARM ASSERTS BOTH HALVES AND IN THIS ORDER: the code FIRST, then the
 * silence. A failing assertion throws and aborts the rest of its own `it`, so an
 * arm whose silence check sits first would score the silence and leave the code
 * unread under exactly the mutant this file exists to catch.
 *
 * NEGATIVE CONTROL, run before this file was committed: reverting
 * `prompt/_shared/read-prompt-input.ts` to the bare `refuse(...)` form reds all
 * three arms with `expected undefined to be 4`, and the fourth arm — the one
 * that must NOT refuse — stays green. The restore was proven by digest equality
 * with the pre-mutation value, not by difference from the mutant's.
 */
const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({
    promptVariants: new PromptVariantsResource({ request } as never)
  })
}));

import { registerPromptCommands } from "./prompt";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerPromptCommands(program);
  setJsonMode(true);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const AGENT_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  // The refusals assign `process.exitCode`, so it has to start unset or an
  // earlier arm's code would satisfy a later arm's assertion.
  process.exitCode = undefined;
});

describe("nexus prompt save — a refusal carries the invalid-input exit code", () => {
  it("--file and --text together", async () => {
    await run([
      "prompt",
      "save",
      "--agent-id",
      AGENT_ID,
      "--variant",
      "main",
      "--file",
      "./p.md",
      "--text",
      "hi"
    ]);
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("neither --file nor --text", async () => {
    await run(["prompt", "save", "--agent-id", AGENT_ID, "--variant", "main"]);
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("--file naming a path that does not exist", async () => {
    await run([
      "prompt",
      "save",
      "--agent-id",
      AGENT_ID,
      "--variant",
      "main",
      "--file",
      "/private/tmp/w2l7-no-such-prompt-file-6f2a1c.md"
    ]);
    expect(process.exitCode).toBe(EXIT_CODES["invalid-input"]);
    expect(request).not.toHaveBeenCalled();
  });

  it("CONTROL — a WELL-FORMED save leaves the exit code unset and does send", async () => {
    // Without this, every arm above is satisfied by a command that refuses
    // everything, including the valid invocation.
    request.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      variantId: "33333333-3333-4333-8333-333333333333",
      variantName: "Main",
      ordinal: 2,
      type: "SAVE",
      name: null,
      isProduction: false,
      promotedFromVersionId: null,
      createdById: null,
      createdAt: "2026-09-01T00:00:00.000Z"
    });

    await run([
      "prompt",
      "save",
      "--agent-id",
      AGENT_ID,
      "--variant",
      "main",
      "--text",
      "Be concise."
    ]);

    expect(process.exitCode).toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      "POST",
      `/agents/${AGENT_ID}/prompt-variants/main/versions`,
      { body: { prompt: "Be concise." } }
    );
  });
});
