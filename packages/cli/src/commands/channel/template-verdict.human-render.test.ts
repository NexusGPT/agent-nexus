import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../../exit-codes";
import { setJsonMode } from "../../output";
import { APPROVAL_REJECTED_EXIT_CATEGORY } from "./template-approval.exit-category";
import type { CreateApprovalOutcome } from "./template-create.await-verdict";
import { renderCreateApprovalVerdict } from "./template-create.verdict.render";
import type { SubmitApprovalOutcome } from "./template-submit-approval.await-verdict";
import { renderSubmitApprovalVerdict } from "./template-submit-approval.verdict.render";
import type { DeliveryOutcome } from "./template-test-send.await-delivery";
import { renderDeliveryOutcome } from "./template-test-send.delivery.render";

/**
 * WHAT THE THREE `--wait` VERBS SAY TO A HUMAN, INCLUDING ON THE BRANCH THAT
 * USED TO SAY NOTHING.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO LAYERS, BECAUSE THEY PROVE DIFFERENT THINGS AND NEITHER IMPLIES THE OTHER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `template-wait.json-document.test.ts` next door is the `--json` half of this,
 * and it is blind to every line below: the renderers run only under
 * `if (!isJsonMode())`, so that file's nine documents are produced by runs in
 * which not one of these functions was called.
 *
 *   · RENDERED OUTPUT (layer 1) calls each renderer directly and pins its exact
 *     lines. One `it` per BRANCH, so a mutant cannot be scored by a neighbour.
 *   · REACHABLE THROUGH THE COMMAND (layer 2) drives the real commander tree
 *     with a stubbed SDK for the two branches this change adds, because a line
 *     no invocation can produce is a line that does not exist. It asserts
 *     CONTAINMENT of the same constants layer 1 pins, so the two cannot drift,
 *     and it does not pin its neighbours' lines — the record above it and the
 *     `Next:` line below it belong to `channel.ts` and are not under test here.
 *
 * ⚠️ ONE ARM PER `it`, WITHOUT EXCEPTION. A failing assertion throws and abandons
 * the rest of its own block, so two arms in one block means a mutant scores
 * whichever is written first while the block still reads red — and which one
 * that is depends on the mutant, not on the writing order.
 *
 * ⚠️ COLOUR IS STRIPPED AND IS NOT ASSERTED. `NO_COLOR` in `output.ts` is
 * computed at module load from `process.stdout.isTTY`, so whether these lines
 * carry ANSI at all is a property of how the suite was launched rather than of
 * the code. Stripping makes the arms answer the question they ask — what words
 * does an operator read — instead of a question about the terminal.
 */

/** ESC, built rather than written: a literal control character in a regex trips `no-control-regex`. */
const ESC = String.fromCharCode(27);

/** Drop `ESC[…m` sequences. Everything `output.ts` emits is that one shape. */
function stripAnsi(text: string): string {
  return text
    .split(ESC)
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf("m") + 1)))
    .join("");
}

/** Capture what one render call writes, as the operator's lines. */
function linesFrom(render: () => void): string[] {
  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });

  try {
    render();
  } finally {
    log.mockRestore();
  }

  return stripAnsi(out.join("\n")).split("\n");
}

// ── The two lines this change adds, named once ───────────────────────────────
//
// Shared between the layer that pins them and the layer that proves a real
// invocation reaches them, so a reworded line cannot pass one and fail the
// other — or worse, pass both while they describe different sentences.

const SUBMIT_UNCONFIRMED =
  "Unconfirmed: the submission reported rejected and no approval record was readable in 2m.";
const SUBMIT_UNCONFIRMED_POINTER = "Confirm: nexus channel whatsapp-template approvals";
const SEND_UNCONFIRMED =
  "Unconfirmed: the send reported failed and no delivery status was readable in 2m.";

describe("create --submit — every branch prints", () => {
  it("never decided — points at approvals rather than claiming a verdict", () => {
    const outcome: CreateApprovalOutcome = {
      status: undefined,
      rejectionReason: undefined,
      decided: false,
      disposition: undefined
    };

    // MUTANT: invert `!outcome.decided` -> the timeout prints an approval line.
    expect(linesFrom(() => renderCreateApprovalVerdict(outcome))).toEqual([
      "Status still pending. Check later: nexus channel whatsapp-template approvals"
    ]);
  });

  it("rejected — the verdict and Meta's reason", () => {
    const outcome: CreateApprovalOutcome = {
      status: "rejected",
      rejectionReason: "Sample content missing",
      decided: true,
      disposition: "settled"
    };

    // MUTANT: drop the `outcome.status === "rejected"` branch -> a rejection
    // renders as "Template approved by Meta", which is the failure the narrow
    // terminal predicate next door exists to keep unreachable.
    expect(linesFrom(() => renderCreateApprovalVerdict(outcome))).toEqual([
      "✗ Template rejected by Meta: rejected",
      "  Reason: Sample content missing"
    ]);
  });

  it("approved — one line, no reason", () => {
    const outcome: CreateApprovalOutcome = {
      status: "approved",
      rejectionReason: undefined,
      decided: true,
      disposition: "settled"
    };

    // MUTANT: reach this line for any settled status -> see the arm above.
    expect(linesFrom(() => renderCreateApprovalVerdict(outcome))).toEqual([
      "✓ Template approved by Meta."
    ]);
  });
});

describe("submit-approval --wait — every branch prints", () => {
  it("a probe SAW it settle — the resolution, with the reason the row carried", () => {
    const outcome: SubmitApprovalOutcome = {
      status: "rejected",
      rejectionReason: "Sample content missing",
      observedTerminal: true,
      disposition: "settled"
    };

    // MUTANT: invert `outcome.observedTerminal` -> a confirmed verdict renders
    // as the unconfirmed line and its reason is dropped.
    expect(linesFrom(() => renderSubmitApprovalVerdict(outcome))).toEqual([
      "Approval resolved: rejected",
      "Reason: Sample content missing"
    ]);
  });

  /**
   * THE BRANCH THAT USED TO BE SILENT. Its renderer's docblock carries why this
   * input is reachable and why it is not the timeout line; what matters here is
   * that both halves are asserted — the verdict AND the word unconfirmed.
   */
  it("settled but unconfirmed — reports the verdict and says it is unconfirmed", () => {
    const outcome: SubmitApprovalOutcome = {
      status: "rejected",
      rejectionReason: undefined,
      observedTerminal: false,
      disposition: "settled"
    };

    // MUTANT: delete the `disposition === "settled"` branch -> silence returns,
    // which is the defect. Falling THROUGH to the timeout line instead is the
    // other mutant, and it reds this arm too.
    expect(linesFrom(() => renderSubmitApprovalVerdict(outcome))).toEqual([
      SUBMIT_UNCONFIRMED,
      SUBMIT_UNCONFIRMED_POINTER
    ]);
  });

  it("still awaiting — the timeout line, which is what the poll actually had", () => {
    const outcome: SubmitApprovalOutcome = {
      status: "received",
      rejectionReason: undefined,
      observedTerminal: false,
      disposition: "awaiting"
    };

    // MUTANT: test `disposition !== "awaiting"` for the unconfirmed branch ->
    // a wait state renders as an unconfirmed verdict.
    expect(linesFrom(() => renderSubmitApprovalVerdict(outcome))).toEqual([
      "Still received after 2m. Check again: nexus channel whatsapp-template approvals"
    ]);
  });

  it("a status this CLI cannot read — the timeout line, never a verdict", () => {
    const outcome: SubmitApprovalOutcome = {
      status: "paused",
      rejectionReason: undefined,
      observedTerminal: false,
      disposition: "unrecognised"
    };

    // MUTANT: widen the unconfirmed branch to `disposition !== "awaiting"` -> an
    // unknown status is announced as a settled verdict nobody confirmed, which
    // is the one direction `isApprovalTerminal` refuses.
    expect(linesFrom(() => renderSubmitApprovalVerdict(outcome))).toEqual([
      "Still paused after 2m. Check again: nexus channel whatsapp-template approvals"
    ]);
  });
});

describe("test-send --wait — every branch prints", () => {
  it("a probe SAW it delivered", () => {
    const outcome: DeliveryOutcome = {
      status: "delivered",
      errorCode: undefined,
      errorMessage: undefined,
      observedTerminal: true
    };

    // MUTANT: route a succeeded status through `isDeliveryFailed` -> a delivery
    // renders as a failure.
    expect(linesFrom(() => renderDeliveryOutcome(outcome))).toEqual(["✓ Message delivered."]);
  });

  it("a probe SAW it fail — the failure and Twilio's error fields", () => {
    const outcome: DeliveryOutcome = {
      status: "undelivered",
      errorCode: 63016,
      errorMessage: "Failed to send freeform message",
      observedTerminal: true
    };

    // MUTANT: drop the errorCode line -> the operator gets a failure with no
    // cause, which is the whole value of having waited.
    expect(linesFrom(() => renderDeliveryOutcome(outcome))).toEqual([
      "✗ Message undelivered.",
      "  Error 63016: Failed to send freeform message"
    ]);
  });

  /**
   * THE BRANCH THAT USED TO BE SILENT, delivery side. The caller once gated
   * `process.exitCode = 1` on `observedTerminal`, so this run exited 0 with a
   * failed send and this line was the only thing that told the operator —
   * which is why its absence mattered more here than the wording does.
   *
   * The gate is gone: `template-test-send.exit-category.ts` is keyed on the
   * STATUS, so this run now exits `outcome-not-reached` as well. The line still
   * earns its place — a number says a send failed, and only this says the CLI
   * never got that confirmed.
   */
  it("terminal but unconfirmed — reports the status and says it is unconfirmed", () => {
    const outcome: DeliveryOutcome = {
      status: "failed",
      errorCode: undefined,
      errorMessage: undefined,
      observedTerminal: false
    };

    // MUTANT: delete the `isDeliveryTerminal` branch -> silence returns.
    expect(linesFrom(() => renderDeliveryOutcome(outcome))).toEqual([SEND_UNCONFIRMED]);
  });

  it("still moving — the in-transit line", () => {
    const outcome: DeliveryOutcome = {
      status: "sent",
      errorCode: undefined,
      errorMessage: undefined,
      observedTerminal: false
    };

    // MUTANT: invert `isDeliveryTerminal` here -> a message still in flight is
    // announced as an unconfirmed terminal status.
    expect(linesFrom(() => renderDeliveryOutcome(outcome))).toEqual([
      "Status still 'sent' after 2m. The message may still be in transit."
    ]);
  });
});

// ── Layer 2: the same two lines, through the real command ────────────────────

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

/**
 * Drive the real channel tree on the HUMAN channel and hand back every line it
 * wrote, plus the exit status it left behind.
 *
 * The clock is faked exactly as the `--json` sibling fakes it: the polls are
 * real, and 400 s is longer than any budget in this directory, so a case cannot
 * pass by the clock stopping short of the wait it claims to reproduce.
 */
async function runHuman(argv: string[]): Promise<{ lines: string[]; exitCode: unknown }> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerChannelCommands(program);
  setJsonMode(false);

  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const previousExitCode = process.exitCode;
  let observedExitCode: unknown;
  try {
    const run = program.parseAsync(["node", "nexus", ...argv]);
    await vi.advanceTimersByTimeAsync(400_000);
    await run;
    observedExitCode = process.exitCode;
  } finally {
    log.mockRestore();
    write.mockRestore();
    process.exitCode = previousExitCode;
  }

  return { lines: stripAnsi(out.join("\n")).split("\n"), exitCode: observedExitCode };
}

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

describe("the unconfirmed branches are reachable through the command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submit-approval: an already-decided template whose row the list never returns", async () => {
    // The idempotent submit path — Twilio reports the existing verdict — against
    // an approvals list that answers 200 without this template's row.
    submitTemplateApproval.mockResolvedValue({ sid: "HXapproval1", status: "rejected" });
    listTemplateApprovals.mockResolvedValue([]);

    const { lines } = await runHuman(SUBMIT_ARGV);

    // MUTANT: restore the silence -> this line is absent and the run says
    // nothing at all about the two minutes it spent.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(SUBMIT_UNCONFIRMED);
  });

  it("submit-approval: and that same run exits outcome-not-reached", async () => {
    submitTemplateApproval.mockResolvedValue({ sid: "HXapproval1", status: "rejected" });
    listTemplateApprovals.mockResolvedValue([]);

    const { exitCode } = await runHuman(SUBMIT_ARGV);

    // The status-keyed rule in `template-approval.exit-category.ts` fires here
    // while `observedTerminal` is false — which is why calling this branch a
    // timeout in prose would contradict the command's own exit status.
    expect(exitCode).toBe(EXIT_CODES[APPROVAL_REJECTED_EXIT_CATEGORY]);
  });

  it("test-send: a send that came back failed while every status probe threw", async () => {
    testSendWhatsAppTemplate.mockResolvedValue({
      messageSid: "SM1",
      status: "failed",
      to: "+15550100",
      from: "+15550199"
    });
    getTestSendStatus.mockRejectedValue(new Error("status read failed"));

    const { lines } = await runHuman(SEND_ARGV);

    // MUTANT: restore the silence -> a failed send reports nothing at all about
    // the fact that no probe ever confirmed it.
    expect(lines, `stdout was:\n${lines.join("\n")}`).toContain(SEND_UNCONFIRMED);
  });
});
