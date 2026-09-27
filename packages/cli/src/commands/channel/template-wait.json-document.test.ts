import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../../output";
import { describeStdout } from "../json-one-document.scan";

/**
 * THE NINE DOCUMENTS, READ OFF STDOUT — THREE VERBS × THREE WAITING STATES.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ASSEMBLERS' OWN SPEC IS NOT THIS. IT PROVES THE FUNCTION, NOT THE DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `template-wait.document-fields.test.ts` calls the three assemblers directly.
 * That is the right subject for the derivation, and it is blind to everything
 * between the assembler and a caller's `jq`: the spread order in `channel.ts`,
 * a response key of the same name winning, a second document landing beside the
 * first. Every case here drives the REAL registrar through commander with a
 * stubbed SDK, lets the REAL poll run, captures stdout and parses it.
 *
 * ⚠️ THE POLLS ARE REAL AND THE CLOCK IS NOT. `submit-approval` and `test-send`
 * budget 120 s and `create --submit` 30 s, all at a 5 s interval, so the three
 * timeout cases are ~4½ minutes of wall clock. `vi.useFakeTimers()` fakes
 * `Date.now` as well as `setTimeout`, which is what `pollForTerminalState` tests
 * its budget against, so advancing the clock drives every iteration the real run
 * would take. Nothing about the loop is stubbed or shortened.
 *
 * ⚠️ EACH CASE ASSERTS THE WHOLE DOCUMENT WITH `toEqual`, and each `it` holds
 * exactly one such arm. A failing assertion throws and abandons the rest of its
 * block, so two arms in one block means a mutant scores only the first — and
 * which one that is depends on the mutant, not on the writing order.
 */

const createWhatsAppTemplate = vi.fn();
const submitTemplateApproval = vi.fn();
const listTemplateApprovals = vi.fn();
const testSendWhatsAppTemplate = vi.fn();
const getTestSendStatus = vi.fn();

vi.mock("../../client", () => ({
  createClient: () => ({
    channels: {
      createWhatsAppTemplate,
      submitTemplateApproval,
      listTemplateApprovals,
      testSendWhatsAppTemplate,
      getTestSendStatus
    }
  }),
  seconds: (n: number) => n,
  MAX_TIMEOUT_SECONDS: 7200,
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerChannelCommands } from "../channel";

const CONNECTION = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_ID = "HXtemplate1";

/** One approval row shaped as `listTemplateApprovals` returns it. */
function approvalRow(status: string, rejectionReason?: string) {
  return {
    sid: TEMPLATE_ID,
    approvalRequests: {
      name: "welcome",
      category: "UTILITY",
      status,
      rejection_reason: rejectionReason
    }
  };
}

/**
 * Drive the real channel tree under `--json` and hand back the one document it
 * wrote, with the clock advanced past every poll budget in the directory.
 */
async function runJson(argv: string[]): Promise<Record<string, unknown>> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerChannelCommands(program);
  setJsonMode(true);

  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const previousExitCode = process.exitCode;
  try {
    const run = program.parseAsync(["node", "nexus", "--json", ...argv]);
    // Longer than any budget in this directory, so a case cannot pass by the
    // clock stopping short of the timeout it claims to reproduce.
    await vi.advanceTimersByTimeAsync(400_000);
    await run;
  } finally {
    log.mockRestore();
    write.mockRestore();
    setJsonMode(false);
    process.exitCode = previousExitCode;
  }

  const stdout = out.join("\n");
  expect(describeStdout(stdout), `stdout was:\n${stdout}`).toEqual({ documents: 1, prose: false });
  return JSON.parse(stdout) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  createWhatsAppTemplate.mockResolvedValue({
    id: TEMPLATE_ID,
    friendly_name: "welcome",
    language: "en"
  });
  submitTemplateApproval.mockResolvedValue({ sid: "HXapproval1", status: "pending" });
  testSendWhatsAppTemplate.mockResolvedValue({
    messageSid: "SM1",
    status: "queued",
    to: "+15550100",
    from: "+15550199"
  });
});

const CREATE_ARGV = [
  "channel",
  "whatsapp-template",
  "create",
  "--connection-id",
  CONNECTION,
  "--friendly-name",
  "welcome",
  "--language",
  "en",
  "--body",
  "Hello {{1}}"
];

const SUBMIT_ARGV = [
  "channel",
  "whatsapp-template",
  "submit-approval",
  "--connection-id",
  CONNECTION,
  "--template-id",
  TEMPLATE_ID,
  "--name",
  "welcome",
  "--category",
  "UTILITY"
];

const SEND_ARGV = [
  "channel",
  "whatsapp-template",
  "test-send",
  "--connection-id",
  CONNECTION,
  "--template-id",
  TEMPLATE_ID,
  "--to",
  "+15550100"
];

describe("create --submit — the approval sub-document", () => {
  it("did not wait — plain create emits no approval object at all", async () => {
    const doc = await runJson(CREATE_ARGV);

    expect(doc).toEqual({ id: TEMPLATE_ID, friendly_name: "welcome", language: "en" });
  });

  it("waited and resolved", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("approved")]);

    const doc = await runJson([...CREATE_ARGV, "--submit", "--category", "UTILITY"]);

    expect(doc.approval).toEqual({
      sid: "HXapproval1",
      status: "approved",
      wait: "resolved",
      waited: true,
      timedOut: false
    });
  });

  it("waited and timed out", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("pending")]);

    const doc = await runJson([...CREATE_ARGV, "--submit", "--category", "UTILITY"]);

    expect(doc.approval).toEqual({
      sid: "HXapproval1",
      status: "pending",
      wait: "timed-out",
      waited: true,
      timedOut: true
    });
  });

  /**
   * No probe ever found the row, so the document carries NO `status` of its own
   * and falls back to the submit response's. Before `wait` existed this was
   * byte-identical to the case above — "polled and saw pending" and "polled and
   * learned nothing at all" printed the same object — and it is the case the
   * `status !== undefined` guard in the assembler exists for.
   */
  it("waited and never found the row — still a timeout, not a missing verdict", async () => {
    listTemplateApprovals.mockResolvedValue([]);

    const doc = await runJson([...CREATE_ARGV, "--submit", "--category", "UTILITY"]);

    expect(doc.approval).toEqual({
      sid: "HXapproval1",
      status: "pending",
      wait: "timed-out",
      waited: true,
      timedOut: true
    });
  });
});

describe("submit-approval — the three waiting states", () => {
  it("did not wait", async () => {
    const doc = await runJson(SUBMIT_ARGV);

    expect(doc).toEqual({
      sid: "HXapproval1",
      status: "pending",
      wait: "not-requested",
      waited: false,
      timedOut: false
    });
  });

  it("waited and resolved", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("rejected", "Sample content missing")]);

    const doc = await runJson([...SUBMIT_ARGV, "--wait"]);

    expect(doc).toEqual({
      sid: "HXapproval1",
      status: "rejected",
      rejectionReason: "Sample content missing",
      wait: "resolved",
      waited: true,
      timedOut: false
    });
  });

  it("waited and timed out", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("pending")]);

    const doc = await runJson([...SUBMIT_ARGV, "--wait"]);

    expect(doc).toEqual({
      sid: "HXapproval1",
      status: "pending",
      wait: "timed-out",
      waited: true,
      timedOut: true
    });
  });
});

describe("test-send — the three waiting states", () => {
  it("did not wait", async () => {
    const doc = await runJson(SEND_ARGV);

    expect(doc).toEqual({
      messageSid: "SM1",
      status: "queued",
      to: "+15550100",
      from: "+15550199",
      wait: "not-requested",
      waited: false,
      timedOut: false
    });
  });

  it("waited and resolved", async () => {
    getTestSendStatus.mockResolvedValue({ status: "delivered" });

    const doc = await runJson([...SEND_ARGV, "--wait"]);

    expect(doc).toEqual({
      messageSid: "SM1",
      status: "delivered",
      to: "+15550100",
      from: "+15550199",
      wait: "resolved",
      waited: true,
      timedOut: false
    });
  });

  it("waited and timed out", async () => {
    getTestSendStatus.mockResolvedValue({ status: "sent" });

    const doc = await runJson([...SEND_ARGV, "--wait"]);

    expect(doc).toEqual({
      messageSid: "SM1",
      status: "sent",
      to: "+15550100",
      from: "+15550199",
      wait: "timed-out",
      waited: true,
      timedOut: true
    });
  });
});
