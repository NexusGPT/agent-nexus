import { describe, expect, it } from "vitest";

import { formatDeployability, formatDeployabilityCell } from "./vibe";

/**
 * `deployability` is the one-field answer to "why does my URL do nothing", and
 * these two functions are the only place the CLI ever says it. The assertions
 * are on the WORDS rather than on a colour code, because the defect being fixed
 * is that an operator could not tell two states apart by reading the output.
 */
describe("formatDeployability — the `app get` line", () => {
  it("says a deployable app builds on a push, so 'nothing happened' is not ambiguous", () => {
    const line = formatDeployability("DEPLOYABLE", { id: "p1", name: "greeter", status: "READY" });
    expect(line).toContain("deployable");
    expect(line).toContain("push");
  });

  it("names the FIX for an app with no source, not just the state", () => {
    // The state alone reproduces the original complaint one level up: the
    // operator now knows something is wrong and still not what to do.
    const line = formatDeployability("NO_SOURCE_ATTACHED", null);
    expect(line).toContain("no source attached");
    expect(line).toContain("attach-repo");
  });

  it("names the project and its status when one is attached but not ready", () => {
    // A DIFFERENT fix from the case above — wait for or repair the project that
    // is already there — which is why the enum has three values, not a boolean.
    const line = formatDeployability("SOURCE_NOT_READY", {
      id: "p1",
      name: "greeter",
      status: "PENDING"
    });
    expect(line).toContain("source not ready");
    expect(line).toContain("greeter");
    expect(line).toContain("PENDING");
    expect(line).not.toContain("attach-repo");
  });

  it("still renders SOURCE_NOT_READY when the project summary is absent", () => {
    // The two fields are independent on the wire, so the printer must not
    // assume a non-null project just because the status implies one.
    const line = formatDeployability("SOURCE_NOT_READY", null);
    expect(line).toContain("source not ready");
    expect(line).not.toContain("undefined");
    expect(line).not.toContain("null");
  });
});

describe("formatDeployabilityCell — the `app list` column", () => {
  it("distinguishes all three states", () => {
    const cells = [
      formatDeployabilityCell("DEPLOYABLE"),
      formatDeployabilityCell("NO_SOURCE_ATTACHED"),
      formatDeployabilityCell("SOURCE_NOT_READY")
    ];
    expect(new Set(cells).size).toBe(3);
  });

  it("keeps each cell short enough to sit in a table", () => {
    for (const state of ["DEPLOYABLE", "NO_SOURCE_ATTACHED", "SOURCE_NOT_READY"] as const) {
      // Strip ANSI so the check is about the text, not the colour codes.
      // eslint-disable-next-line no-control-regex
      const plain = formatDeployabilityCell(state).replace(/\[[0-9;]*m/g, "");
      expect(plain.length).toBeLessThanOrEqual(12);
    }
  });

  it("carries no remedy text — a cell has no room, so `app get` owns the fix", () => {
    expect(formatDeployabilityCell("NO_SOURCE_ATTACHED")).not.toContain("attach-repo");
  });
});

/**
 * The CLI ships standalone to npm and is routinely pointed at a backend older
 * than itself — `deployability` is a recent field, so it can be genuinely
 * absent on the wire. An exhaustive `switch` would satisfy the compiler and
 * return `undefined`, which `printTable` then renders as the literal string.
 *
 * These two cast deliberately: the point is to drive a value the TYPE says is
 * impossible, because the wire is not bound by the type.
 */
describe("a backend that does not report deployability", () => {
  it("says the server did not report it, rather than printing `undefined`", () => {
    const line = formatDeployability(undefined as never, null);
    expect(line).not.toContain("undefined");
    expect(line).toContain("not reported");
  });

  it("renders a dash in the table cell rather than `undefined`", () => {
    const cell = formatDeployabilityCell(undefined as never);
    expect(cell).not.toContain("undefined");
    expect(cell).toContain("—");
  });
});
