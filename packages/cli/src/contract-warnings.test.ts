import type { ContractReport } from "@agent-nexus/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTRACT_WARNINGS_ENV,
  contractWarningsEnabled,
  createContractReporter,
  resetContractWarnings
} from "./contract-warnings";

/**
 * The reporter that turns a drifted payload into a line the USER sees.
 *
 * The backend's own interceptor already notices this drift and reports it to
 * Sentry — to us. These assertions are about the other half: the person whose
 * `--json` output just changed shape, who has no Sentry.
 */

const MISMATCH: ContractReport = {
  state: "mismatch",
  route: "DocumentGet",
  method: "GET",
  path: "/documents/abc",
  issues: [
    { at: "size", message: "the route publishes null | number and the payload holds string" }
  ],
  issueCount: 1
};

let stderr: string[];

beforeEach(() => {
  stderr = [];
  resetContractWarnings();
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
});

afterEach(() => vi.restoreAllMocks());

const out = () => stderr.join("");

describe("the switch", () => {
  it("is ON when nothing is set", () => {
    expect(contractWarningsEnabled({})).toBe(true);
    expect(createContractReporter({})).toBeTypeOf("function");
  });

  it("is OFF for exactly `off`, however it is spelled or padded", () => {
    for (const value of ["off", "OFF", " Off "]) {
      expect(contractWarningsEnabled({ [CONTRACT_WARNINGS_ENV]: value })).toBe(false);
      expect(createContractReporter({ [CONTRACT_WARNINGS_ENV]: value })).toBeUndefined();
    }
  });

  it("stays ON for any other value, rather than guessing at intent", () => {
    // `NEXUS_CONTRACT_WARNINGS=0` and `=false` look like off and are not the
    // documented value. Warning is the safe reading of an unrecognised setting:
    // a user who wanted silence and got a warning tries again, and a user who
    // wanted the warning and got silence never finds out.
    for (const value of ["0", "false", "no", "on", "warn", ""]) {
      expect(contractWarningsEnabled({ [CONTRACT_WARNINGS_ENV]: value })).toBe(true);
    }
  });

  it("returns UNDEFINED when off, so the SDK skips the work too", () => {
    // Not a no-op function. The SDK consults its route manifest only when a
    // reporter is installed, so this is what makes `off` actually free.
    expect(createContractReporter({ [CONTRACT_WARNINGS_ENV]: "off" })).toBeUndefined();
  });
});

describe("what the user sees", () => {
  it("names the route, the field, and both types", () => {
    createContractReporter({})?.(MISMATCH);

    expect(out()).toContain("GET /documents/abc");
    expect(out()).toContain("size: the route publishes null | number and the payload holds string");
  });

  it("says the data was NOT altered, because that is the whole design", () => {
    createContractReporter({})?.(MISMATCH);
    expect(out()).toContain("printed unchanged");
  });

  it("names the environment variable that silences it", () => {
    // A suppression switch nobody can find is not a suppression switch. This
    // assertion is the reason the variable name is in the message at all.
    createContractReporter({})?.(MISMATCH);
    expect(out()).toContain(`${CONTRACT_WARNINGS_ENV}=off`);
  });

  it("writes to stderr ONLY, so `--json` stdout stays parseable", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    createContractReporter({})?.(MISMATCH);

    expect(out()).not.toBe("");
    expect(stdout).not.toHaveBeenCalled();
  });

  it("reports the true total when the issue list was capped", () => {
    createContractReporter({})?.({ ...MISMATCH, issueCount: 12 });
    expect(out()).toContain("and 11 more");
  });
});

describe("what the user does NOT see", () => {
  it("says nothing for a payload that matched", () => {
    createContractReporter({})?.({ ...MISMATCH, state: "passed", issues: undefined });
    expect(out()).toBe("");
  });

  it("says nothing for an UNCHECKED read", () => {
    // `unchecked` is a fact about the CONTRACT, not about this run — 113 routes
    // publish no schema. Printing it would put a line on almost every command
    // and teach the reader to stop looking.
    createContractReporter({})?.({
      ...MISMATCH,
      state: "unchecked",
      issues: undefined,
      reason: "the route publishes no response schema"
    });
    expect(out()).toBe("");
  });

  it("says the same thing only ONCE, however many rows carry it", () => {
    // A drifted field is drifted in every element of a list. Fifty identical
    // sentences is how a real warning becomes noise.
    const report = createContractReporter({});
    for (let i = 0; i < 50; i++) report?.({ ...MISMATCH, path: `/documents/${i}` });

    expect(out().match(/publishes null \| number/g)).toHaveLength(1);
  });

  it("...but a DIFFERENT drift on the same route is still reported", () => {
    // The dedupe key carries the issues, not just the route, so silencing one
    // finding cannot silence the next one.
    const report = createContractReporter({});
    report?.(MISMATCH);
    report?.({
      ...MISMATCH,
      issues: [{ at: "name", message: "the route publishes string and the payload holds null" }]
    });

    expect(out()).toContain("size:");
    expect(out()).toContain("name:");
  });
});
