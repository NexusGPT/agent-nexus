import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../../exit-codes";
import { setJsonMode } from "../../output";

/**
 * THE EXIT CODE EVERY `--wait` OUTCOME ACTUALLY PRODUCES, THROUGH THE REAL TREE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE APPLIERS' OWN SPECS ARE NOT THIS. THEY PROVE THE RULE, NOT THE WIRING.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `template-wait.exit-category.test.ts` and `template-test-send.exit-category.test.ts`
 * call the appliers directly, which is the right subject for each rule and is
 * blind to everything between the rule and a caller's `$?`: an applier wired to
 * the wrong branch, wired with `observedTerminal` instead of the status, a later
 * line clobbering the code, or simply not called. Those specs fall back to
 * scanning `channel.ts` for a call, and a source scan proves a string is present,
 * never that it runs.
 *
 * Every case here drives the REAL registrar through commander with a stubbed SDK,
 * lets the REAL poll spend its REAL budget, and reads `process.exitCode` and the
 * one `--json` document together — because the number and the document are the
 * two things a caller has, and the defect being repaired was exactly them
 * disagreeing.
 *
 * ⚠️ THE POLLS ARE REAL AND THE CLOCK IS NOT, on the same terms as
 * `template-wait.json-document.test.ts`: `vi.useFakeTimers()` fakes `Date.now`,
 * which is what `pollForTerminalState` measures its budget against, so advancing
 * the clock drives every iteration the real run would take. Nothing about the
 * loop is stubbed or shortened.
 *
 * 🚨 `process.exitCode` IS RESET AFTER EVERY CASE AND THAT IS NOT TIDINESS. A
 * case that leaves `10` behind is inherited by the vitest process itself, so the
 * whole run exits non-zero with every test reported as passing.
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
function approvalRow(status: string) {
  return {
    sid: TEMPLATE_ID,
    approvalRequests: { name: "welcome", category: "UTILITY", status }
  };
}

/** What a caller ends up holding: the status of the process, and the document. */
interface Outcome {
  readonly exitCode: number | undefined;
  readonly wait: unknown;
  readonly status: unknown;
}

/** Drive the real channel tree under `--json`, past every budget, and read both. */
async function run(argv: readonly string[], pick: (doc: Record<string, unknown>) => unknown) {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerChannelCommands(program);
  setJsonMode(true);

  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  let exitCode: number | undefined;
  try {
    const parsed = program.parseAsync(["node", "nexus", "--json", ...argv]);
    // Longer than any budget in this directory, so a case cannot pass by the
    // clock stopping short of the timeout it claims to reproduce.
    await vi.advanceTimersByTimeAsync(400_000);
    await parsed;
    exitCode = process.exitCode === undefined ? undefined : Number(process.exitCode);
  } finally {
    log.mockRestore();
    write.mockRestore();
    setJsonMode(false);
  }

  const record = pick(JSON.parse(out.join("\n")) as Record<string, unknown>) as Record<
    string,
    unknown
  >;
  return { exitCode, wait: record.wait, status: record.status } satisfies Outcome;
}

const whole = (doc: Record<string, unknown>): unknown => doc;
const approvalOf = (doc: Record<string, unknown>): unknown => doc.approval;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  process.exitCode = undefined;
  createWhatsAppTemplate.mockResolvedValue({ id: TEMPLATE_ID, friendly_name: "welcome" });
  submitTemplateApproval.mockResolvedValue({ sid: "HXapproval1", status: "pending" });
  testSendWhatsAppTemplate.mockResolvedValue({ messageSid: "SM1", status: "queued" });
});

afterEach(() => {
  process.exitCode = undefined;
});

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
  "UTILITY",
  "--wait"
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
  "+15550100",
  "--wait"
];

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
  "Hello {{1}}",
  "--submit",
  "--category",
  "UTILITY"
];

describe("submit-approval --wait", () => {
  it("a spent budget exits timed-out, and the document says timed-out too", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("pending")]);

    expect(await run(SUBMIT_ARGV, whole)).toEqual({
      exitCode: EXIT_CODES["timed-out"],
      wait: "timed-out",
      status: "pending"
    });
  });

  it("an approvals list this CLI could never read shares that timed-out", async () => {
    // The third state. With the probe swallowing, "Meta is still reviewing" and
    // "I could not read the list at all" are one outcome here — deliberately, as
    // `template-wait.exit-category.ts` argues: the write LANDED, so `7`'s promise
    // of a free retry and `6`'s claim that the server failed are both false.
    listTemplateApprovals.mockRejectedValue(new Error("ECONNRESET"));

    expect(await run(SUBMIT_ARGV, whole)).toEqual({
      exitCode: EXIT_CODES["timed-out"],
      wait: "timed-out",
      status: "pending"
    });
  });

  it("a rejection exits outcome-not-reached, which a timeout must not be", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("rejected")]);

    expect(await run(SUBMIT_ARGV, whole)).toEqual({
      exitCode: EXIT_CODES["outcome-not-reached"],
      wait: "resolved",
      status: "rejected"
    });
  });

  it("an approval leaves the status alone", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("approved")]);

    expect(await run(SUBMIT_ARGV, whole)).toEqual({
      exitCode: undefined,
      wait: "resolved",
      status: "approved"
    });
  });

  it("no --wait leaves the status alone even though nothing settled", async () => {
    const argv = SUBMIT_ARGV.filter((arg) => arg !== "--wait");

    expect(await run(argv, whole)).toEqual({
      exitCode: undefined,
      wait: "not-requested",
      status: "pending"
    });
  });
});

describe("test-send --wait", () => {
  it("a spent budget exits timed-out, and the document says timed-out too", async () => {
    getTestSendStatus.mockResolvedValue({ status: "queued" });

    expect(await run(SEND_ARGV, whole)).toEqual({
      exitCode: EXIT_CODES["timed-out"],
      wait: "timed-out",
      status: "queued"
    });
  });

  it("an undelivered message exits outcome-not-reached, no longer a bare 1", async () => {
    getTestSendStatus.mockResolvedValue({ status: "undelivered", errorCode: 63016 });

    expect(await run(SEND_ARGV, whole)).toEqual({
      exitCode: EXIT_CODES["outcome-not-reached"],
      wait: "resolved",
      status: "undelivered"
    });
  });

  it("a failure no probe ever confirmed exits it too — the observedTerminal hole", async () => {
    // Every probe throws and is swallowed, so the reported status falls back to
    // the SEND's own. The old `observedTerminal &&` guard exited 0 here while
    // the document said `resolved` with a failed status.
    testSendWhatsAppTemplate.mockResolvedValue({ messageSid: "SM1", status: "failed" });
    getTestSendStatus.mockRejectedValue(new Error("ECONNRESET"));

    expect(await run(SEND_ARGV, whole)).toEqual({
      exitCode: EXIT_CODES["outcome-not-reached"],
      wait: "resolved",
      status: "failed"
    });
  });

  it("a delivered message leaves the status alone", async () => {
    getTestSendStatus.mockResolvedValue({ status: "delivered" });

    expect(await run(SEND_ARGV, whole)).toEqual({
      exitCode: undefined,
      wait: "resolved",
      status: "delivered"
    });
  });

  it("no --wait leaves the status alone even though nothing settled", async () => {
    const argv = SEND_ARGV.filter((arg) => arg !== "--wait");

    expect(await run(argv, whole)).toEqual({
      exitCode: undefined,
      wait: "not-requested",
      status: "queued"
    });
  });
});

/**
 * `create --submit` IS THE SCOPE BOUNDARY, AND IT IS ASSERTED RATHER THAN STATED.
 *
 * Its 30-second poll is unconditional — there is no flag to decline it — so its
 * timeout is a create that fully succeeded with a courtesy glance at the review,
 * not a caller missing a verdict they asked for. A later edit that "finishes the
 * job" by wiring the wait rule here reds this case.
 */
describe("create --submit", () => {
  it("a spent budget still exits 0, and the document still says timed-out", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("pending")]);

    expect(await run(CREATE_ARGV, approvalOf)).toEqual({
      exitCode: undefined,
      wait: "timed-out",
      status: "pending"
    });
  });

  it("a rejection exits outcome-not-reached, unchanged by any of this", async () => {
    listTemplateApprovals.mockResolvedValue([approvalRow("rejected")]);

    expect(await run(CREATE_ARGV, approvalOf)).toEqual({
      exitCode: EXIT_CODES["outcome-not-reached"],
      wait: "resolved",
      status: "rejected"
    });
  });
});
