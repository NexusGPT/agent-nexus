import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * THE SIX DELETES THAT NEVER ASKED.
 *
 * `agent-eval`'s six destructive leaves declared `--yes` and had NO prompt
 * behind it. The flag's own help said so, which made it the honest spelling of a
 * dishonest shape: a reader who sees `--yes` on a delete reads a confirmation
 * being skipped, and there was none to skip. The delete happened the moment you
 * pressed enter, at an operator's own keyboard exactly as in CI.
 *
 * That is a DIFFERENT defect from the stream mix-up
 * `customer-delete-confirmation.test.ts` covers. There the command asked and
 * decided on the wrong stream; here it never asked at all, so no choice of
 * stream would have changed anything.
 *
 * ── Why this file drives the commands and not the helper ────────────────────
 *
 * `confirmDestructive` has its own unit coverage, and `confirmable()` is proven
 * in both directions in `destructive-confirmation.test.ts`. Neither can say
 * whether THIS action calls the helper — which is the whole of the bug, because
 * the old code declared the flag correctly enough to look migrated and then went
 * straight to the DELETE. So every case below parses real argv through the real
 * registrar and asserts on the HTTP call that did or did not happen.
 *
 * 🚨 THE DELETE MUST BE ASSERTED, NOT THE PROMPT. A test that only checks a
 * question was asked passes over a command that asks and then deletes whatever
 * the answer was.
 */

const { destructiveCall, question } = vi.hoisted(() => ({
  destructiveCall: vi.fn(),
  question: vi.fn()
}));

/**
 * The seam is `createClient`, and it MOVED — this file used to stub the SDK's
 * `HttpClient` because the namespace built one itself. NEX-3909 put every leaf
 * on `client.agentEvals`, so a stub of the raw transport binds to nothing.
 *
 * 🚨 THAT FAILURE MODE IS THE REASON THIS FILE OPENS WITH CONTROLS. Sixteen of
 * the assertions below are "the delete did NOT happen", and an unbound stub
 * satisfies every one of them for the wrong reason — the command could have
 * deleted six rows and the suite would still have been green on those arms. The
 * `--yes` controls are what actually went red on the migration, which is the
 * design working: a negative assertion is only worth what its positive control
 * is worth.
 *
 * ── The division of labour, stated so neither half looks like the whole ──────
 *
 * This file asks: **did the confirmation gate the destructive call?** It records
 * the SDK METHOD each leaf reaches and the arguments it passes.
 *
 * It does NOT ask whether that method sends the right verb to the right path —
 * a stub cannot know, and asserting a path this file itself spells would only
 * prove one author typed a string twice.
 * `packages/sdk/src/resources/agent-evals.test.ts` owns that half, executes all
 * 33 methods against a recording transport, and derives the expected route from
 * the v1 contract rather than restating it.
 */
vi.mock("../client", () => ({
  createClient: () => ({
    agentEvals: {
      runs: { delete: (id: string) => destructiveCall("runs.delete", [id]) },
      schedules: { delete: (id: string) => destructiveCall("schedules.delete", [id]) },
      templates: {
        delete: (id: string) => destructiveCall("templates.delete", [id]),
        detach: (id: string, agentId: string) => destructiveCall("templates.detach", [id, agentId])
      },
      triggers: { delete: (id: string) => destructiveCall("triggers.delete", [id]) },
      webhooks: { delete: (id: string) => destructiveCall("webhooks.delete", [id]) }
    }
  })
}));

// The confirmation reaches readline through a DYNAMIC import, so the mock has to
// stand in for the real module rather than for a helper the command owns.
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({ question, close: () => undefined })
}));

import { registerAgentEvalCommands } from "./agent-eval";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerAgentEvalCommands(program);
  await program.parseAsync(["node", "nexus", ...argv]);
}

const ID = "3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13";
const AGENT_ID = "7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44";

/**
 * Every destructive leaf in the namespace, with the argv that reaches it and the
 * DELETE it must not perform unasked. Listed here rather than written out six
 * times so a seventh verb is one row, and so the count below cannot silently
 * shrink to one command's worth of coverage.
 */
const DESTRUCTIVE: ReadonlyArray<{ argv: string[]; call: string; args: string[] }> = [
  { argv: ["agent-eval", "run", "delete", ID], call: "runs.delete", args: [ID] },
  { argv: ["agent-eval", "schedule", "delete", ID], call: "schedules.delete", args: [ID] },
  { argv: ["agent-eval", "template", "delete", ID], call: "templates.delete", args: [ID] },
  {
    argv: ["agent-eval", "template", "detach", ID, AGENT_ID],
    call: "templates.detach",
    args: [ID, AGENT_ID]
  },
  { argv: ["agent-eval", "trigger", "delete", ID], call: "triggers.delete", args: [ID] },
  { argv: ["agent-eval", "webhook", "delete", ID], call: "webhooks.delete", args: [ID] }
];

describe("every agent-eval delete asks before it acts", () => {
  const stdinWasTty = process.stdin.isTTY;
  const stdoutWasTty = process.stdout.isTTY;
  const exitCodeWas = process.exitCode;

  beforeEach(() => {
    destructiveCall.mockReset();
    question.mockReset();
    destructiveCall.mockResolvedValue({ id: ID, deleted: true });
    process.exitCode = undefined;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: stdinWasTty, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: stdoutWasTty, configurable: true });
    process.exitCode = exitCodeWas;
    setJsonMode(false);
  });

  function setTty(stdin: boolean, stdout: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROLS FIRST. Every assertion below is "the delete did NOT happen", which
  // is also what a broken harness produces — a mis-spelt argv, a registrar that
  // threw, a mock that never bound. These two prove the harness CAN see a
  // delete, and that it sees one for all six leaves rather than for the first.
  // ───────────────────────────────────────────────────────────────────────────
  it("CONTROL: the table covers six distinct leaves", () => {
    expect(DESTRUCTIVE).toHaveLength(6);
    expect(new Set(DESTRUCTIVE.map((c) => c.call)).size).toBe(6);
  });

  it.each(DESTRUCTIVE)(
    "CONTROL: --yes on a terminal deletes via $call, and asks nothing",
    async ({ argv, call, args }) => {
      setTty(true, true);

      await run([...argv, "--yes"]);

      expect(question).not.toHaveBeenCalled();
      expect(destructiveCall).toHaveBeenCalledWith(call, args);
    }
  );

  it.each(DESTRUCTIVE)("REFUSES $call with no terminal and no --yes", async ({ argv }) => {
    // The defect, in the environment where nobody is watching. Before the fix
    // this deleted and printed a success line.
    setTty(false, false);

    await run(argv);

    expect(question).not.toHaveBeenCalled();
    expect(destructiveCall).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(0);
  });

  it.each(DESTRUCTIVE)(
    "ASKS before $call when stdin is a terminal",
    async ({ argv, call, args }) => {
      // The half that is specific to THIS ticket. NEX-3879's commands already
      // asked and only decided on the wrong stream; these asked nothing at all, so
      // an operator sitting at the keyboard lost the row with no question.
      setTty(true, true);
      question.mockResolvedValue("y");

      await run(argv);

      expect(question).toHaveBeenCalledTimes(1);
      expect(destructiveCall).toHaveBeenCalledWith(call, args);
    }
  );

  it.each(DESTRUCTIVE)("ABORTS $call when the operator answers n", async ({ argv }) => {
    setTty(true, true);
    question.mockResolvedValue("n");

    await run(argv);

    expect(question).toHaveBeenCalledTimes(1);
    expect(destructiveCall).not.toHaveBeenCalled();
  });

  it.each(DESTRUCTIVE)(
    "ABORTS $call on a bare Enter — the capital in [y/N] is a promise",
    async ({ argv }) => {
      setTty(true, true);
      question.mockResolvedValue("");

      await run(argv);

      expect(destructiveCall).not.toHaveBeenCalled();
    }
  );

  it("REFUSES on a closed stdin even when stdout IS a terminal — it must not hang", async () => {
    // `nexus agent-eval run delete <id> < /dev/null`, or the same under a
    // supervisor. Reaching the assertion at all is the proof: `question` is
    // never issued, so there is no promise left for an ended stream to settle.
    setTty(false, true);

    await run(["agent-eval", "run", "delete", ID]);

    expect(question).not.toHaveBeenCalled();
    expect(destructiveCall).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(0);
  });

  it("REFUSES under --json with a document on stdout, not an empty non-zero exit", async () => {
    // A refusal owes the caller something to parse. Non-zero status with nothing
    // on stdout is the one combination a script cannot work around.
    setTty(false, false);
    setJsonMode(true);

    const chunks: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void chunks.push(args.map(String).join(" "));

    try {
      await run(["agent-eval", "webhook", "delete", ID]);
    } finally {
      console.log = log;
    }

    expect(destructiveCall).not.toHaveBeenCalled();
    const parsed = JSON.parse(chunks.join("\n"));
    expect(parsed.error?.message).toContain("refusing without a terminal");
    expect(String(parsed.error?.hint ?? "")).toContain("--yes");
  });

  it("names the resource in the question, so a mistyped id is visible before it is gone", async () => {
    // A bare "Are you sure?" is answerable without reading it. The id is the one
    // thing an operator can still check at this point.
    setTty(true, true);
    question.mockResolvedValue("n");

    await run(["agent-eval", "template", "detach", ID, AGENT_ID]);

    const asked = String(question.mock.calls[0]?.[0] ?? "");
    expect(asked).toContain(ID);
    expect(asked).toContain(AGENT_ID);
  });
});
