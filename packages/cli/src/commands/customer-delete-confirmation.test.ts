import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * THE DELETE THAT ASKED THE WRONG STREAM.
 *
 * `customer delete` gated its confirmation on `process.stdout.isTTY` and then
 * read the answer from `process.stdin`. One mistake, two failures pointing in
 * opposite directions:
 *
 *   · PIPED — `nexus customer delete <id> | tee log`, or anything under --json.
 *     stdout is not a terminal, so the question was skipped and the row was
 *     destroyed with nobody asked. The delete unlinks every deployment session,
 *     cascades the identities and the SessionParticipant rows, and takes the
 *     metadata column — notes, tags, customFields — with it. No dry run, no
 *     export, no undo.
 *   · STDIN CLOSED, STDOUT A TERMINAL — `nexus customer delete <id> </dev/null`,
 *     or under a supervisor. The gate said "ask", so `rl.question` was issued
 *     against a stream that had already ended and nothing could settle the
 *     promise. The prompt printed and the process sat there.
 *
 * Both close on one word: ask STDIN, because whether anyone can answer is a
 * property of the stream the answer arrives on. And when stdin cannot be read,
 * REFUSE — non-interactive is not consent, and refusing costs one retry where
 * proceeding cost the row.
 *
 * ── Why this file drives the command and not the helper ──────────────────────
 *
 * `confirmDestructive` has its own unit coverage. A helper returning false
 * proves nothing about whether THIS action calls it, which is exactly the link
 * that was broken here — the old code asked correctly and decided wrongly. So
 * every case below parses real argv through the real registrar and asserts on
 * the SDK call that did or did not happen.
 */

const { deleteCustomer, question } = vi.hoisted(() => ({
  deleteCustomer: vi.fn(),
  question: vi.fn()
}));

vi.mock("../client", () => ({
  createClient: () => ({ customers: { delete: deleteCustomer } })
}));

// The confirmation reaches readline through a DYNAMIC import, so the mock has
// to stand in for the real module rather than for a helper the command owns.
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({ question, close: () => undefined })
}));

import { registerCustomerCommands } from "./customer";

const CUSTOMER_ID = "3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13";

async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerCustomerCommands(program);
  await program.parseAsync(["node", "nexus", ...argv]);
}

describe("customer delete asks the stream the answer arrives on", () => {
  const stdinWasTty = process.stdin.isTTY;
  const stdoutWasTty = process.stdout.isTTY;
  const exitCodeWas = process.exitCode;

  beforeEach(() => {
    deleteCustomer.mockReset();
    question.mockReset();
    deleteCustomer.mockResolvedValue({ deleted: true });
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
  // CONTROL. Every assertion below is "the delete did NOT happen", which is
  // also what a broken harness produces. This proves the harness CAN see one.
  // ───────────────────────────────────────────────────────────────────────────
  it("CONTROL: --yes on a terminal deletes, and asks nothing", async () => {
    setTty(true, true);

    await run(["customer", "delete", CUSTOMER_ID, "--yes"]);

    expect(question).not.toHaveBeenCalled();
    expect(deleteCustomer).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it("REFUSES when stdin is a pipe, whatever stdout is", async () => {
    // The incident. stdout piped as well — `| tee log` — which is precisely the
    // combination the old gate read as "no need to ask".
    setTty(false, false);

    await run(["customer", "delete", CUSTOMER_ID]);

    expect(question).not.toHaveBeenCalled();
    expect(deleteCustomer).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(0);
  });

  it("REFUSES on a closed stdin even when stdout IS a terminal — it must not hang", async () => {
    // `nexus customer delete <id> < /dev/null`. The old gate saw a terminal on
    // stdout and issued a question against an ended stdin, so the promise never
    // settled. Reaching the assertion at all is the proof it no longer can:
    // `question` is never called, so there is nothing left unresolved.
    setTty(false, true);

    await run(["customer", "delete", CUSTOMER_ID]);

    expect(question).not.toHaveBeenCalled();
    expect(deleteCustomer).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(0);
  });

  it("PROCEEDS when stdin is a terminal and the operator answers y", async () => {
    setTty(true, true);
    question.mockResolvedValue("y");

    await run(["customer", "delete", CUSTOMER_ID]);

    expect(question).toHaveBeenCalledTimes(1);
    expect(deleteCustomer).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it("ABORTS when stdin is a terminal and the operator answers n", async () => {
    setTty(true, true);
    question.mockResolvedValue("n");

    await run(["customer", "delete", CUSTOMER_ID]);

    expect(question).toHaveBeenCalledTimes(1);
    expect(deleteCustomer).not.toHaveBeenCalled();
  });

  it("ABORTS on a bare Enter — the capital in [y/N] is a promise", async () => {
    setTty(true, true);
    question.mockResolvedValue("");

    await run(["customer", "delete", CUSTOMER_ID]);

    expect(deleteCustomer).not.toHaveBeenCalled();
  });

  it("REFUSES under --json with a document on stdout, not an empty non-zero exit", async () => {
    // A refusal owes the caller something to parse. `console.error` + exit 1 is
    // the one combination a script cannot work around: non-zero status and
    // nothing on stdout.
    setTty(false, false);
    setJsonMode(true);

    const chunks: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void chunks.push(args.map(String).join(" "));

    try {
      await run(["customer", "delete", CUSTOMER_ID]);
    } finally {
      console.log = log;
    }

    expect(deleteCustomer).not.toHaveBeenCalled();
    const parsed = JSON.parse(chunks.join("\n"));
    expect(parsed.error?.message).toContain("refusing without a terminal");
    // The hint is the next step for THIS failure, so it must name the flag.
    expect(String(parsed.error?.hint ?? "")).toContain("--yes");
  });
});
