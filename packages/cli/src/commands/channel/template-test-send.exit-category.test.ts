import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { EXIT_CODES, exitCategoryFor } from "../../exit-codes";
import { isDeliveryFailed } from "./template-test-send.await-delivery";
import {
  applyDeliveryVerdictExitCode,
  DELIVERY_FAILED_EXIT_CATEGORY
} from "./template-test-send.exit-category";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHANNEL_SOURCE = join(HERE, "..", "channel.ts");

/** A sentinel no category claims — see `template-approval.exit-category.test.ts`. */
const UNTOUCHED = 77;

afterEach(() => {
  process.exitCode = undefined;
});

describe("a billed, undelivered send exits outcome-not-reached", () => {
  it.each([["failed"], ["undelivered"]])("%s sets the status the category means", (status) => {
    process.exitCode = undefined;
    applyDeliveryVerdictExitCode(status);
    expect(process.exitCode).toBe(EXIT_CODES["outcome-not-reached"]);
  });

  it("is no longer the generic failure this site used to write", () => {
    // The bare `process.exitCode = 1` here was the last entry keeping
    // `commands/channel.ts` in `EXPECTED_BARE_ONE_SITES`. `1` says "the CLI
    // broke"; Twilio reporting a delivery outcome is the request working.
    process.exitCode = undefined;
    applyDeliveryVerdictExitCode("undelivered");
    expect(process.exitCode).not.toBe(EXIT_CODES.failed);
  });

  it("is not a timeout — this send was settled, and money already moved", () => {
    process.exitCode = undefined;
    applyDeliveryVerdictExitCode("failed");
    expect(process.exitCode).not.toBe(EXIT_CODES["timed-out"]);
  });

  it("names a category the taxonomy declares, rather than a number of its own", () => {
    expect({
      category: DELIVERY_FAILED_EXIT_CATEGORY,
      roundTrips: exitCategoryFor(EXIT_CODES[DELIVERY_FAILED_EXIT_CATEGORY])
    }).toEqual({ category: "outcome-not-reached", roundTrips: DELIVERY_FAILED_EXIT_CATEGORY });
  });
});

/**
 * EVERY OTHER DELIVERY STATUS LEAVES `process.exitCode` EXACTLY AS IT WAS.
 *
 * ⚠️ `delivered` AND `read` ARE THE ARMS A REWRITE BREAKS. A module spelled
 * `process.exitCode = EXIT_CODES[failed ? "outcome-not-reached" : "success"]`
 * passes every arm above and erases a non-zero an earlier step set — and at the
 * call site the earlier step is this verb's own refusal path.
 */
describe("no other delivery status touches the process status", () => {
  it.each([["delivered"], ["read"], ["queued"], ["sent"], ["accepted"], ["FAILED"], [""]])(
    "%s leaves it untouched",
    (status) => {
      process.exitCode = UNTOUCHED;
      applyDeliveryVerdictExitCode(status);
      expect(process.exitCode).toBe(UNTOUCHED);
    }
  );
});

/**
 * THE RULE IS KEYED ON THE STATUS, NOT ON "A PROBE WATCHED IT SETTLE".
 *
 * The old condition was `observedTerminal && isDeliveryFailed(status)`, and the
 * first half was a hole: when every probe throws and is swallowed, the reported
 * status falls back to the SEND's own, so a send that came back `failed`
 * rendered as a failure, published `"wait": "resolved"` with a failed `status`,
 * and exited 0. This applier takes a status and nothing else, so the hole cannot
 * be re-opened without changing its signature.
 */
describe("commands/channel.ts hands it the status and no probe flag", () => {
  it("calls the applier once, on the status, with no observedTerminal guard", () => {
    const source = readFileSync(CHANNEL_SOURCE, "utf8");
    // Anti-vacuity: a wrong path or a moved file makes every count below zero,
    // and the two `false` expectations are TRUE of an empty string.
    expect(source).toContain("awaitDeliveryOutcome");

    expect({
      applierCalls: [...source.matchAll(/applyDeliveryVerdictExitCode\(delivery\.status\)/g)]
        .length,
      guardsOnAProbeFlag: source.includes("delivery.observedTerminal"),
      restatesThePredicate: source.includes("isDeliveryFailed")
    }).toEqual({ applierCalls: 1, guardsOnAProbeFlag: false, restatesThePredicate: false });
  });
});

describe("the predicate the rule keys off is the one the poll already owned", () => {
  it.each([
    ["failed", true],
    ["undelivered", true],
    ["delivered", false],
    ["read", false],
    ["queued", false]
  ])("%s -> %s", (status, expected) => {
    expect(isDeliveryFailed(status)).toBe(expected);
  });
});
