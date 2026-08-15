import { describe, expect, it, vi } from "vitest";

import type { VibeAppDto } from "../vibe-wire-types";
import { buildAppUpdateBody, formatShipGateMode, printVibeApp } from "./vibe";

/**
 * `shipGateMode` has THREE states and the CLI knew two of them, in both
 * directions: `vibe app get` printed the server's lossy boolean projection, so a
 * WARN app read `Ship gate: off` while every one of its deploys wrote
 * DEPLOYMENT_VERIFICATION_WARNED, and `vibe app update` had no flag that could
 * reach WARN at all.
 *
 * 🚨 EVERY ASSERTION BELOW HAS TO SEPARATE WARN FROM OFF. A suite that checks
 * only the two ends passes against the exact defect it is meant to catch —
 * which is how this shipped.
 */

/** A WARN app exactly as the server sends one: the mode set, the boolean false. */
const WARN_APP: VibeAppDto = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  name: "greeter",
  description: null,
  requireApprovals: false,
  // false BECAUSE the mode is WARN — `requireVerification` is
  // `shipGateMode === "ENFORCE"` and a warning app does not refuse. Reading this
  // field is what produced the wrong row, so the fixture keeps the trap in it.
  requireVerification: false,
  shipGateMode: "WARN",
  deployBranch: "main",
  resourceQuotas: { cpuMhz: 1000, memoryMiB: 1024, maxInstances: 5 },
  healthCheckConfig: {},
  publicUrl: null,
  visibility: "PRIVATE",
  edgeReachability: null,
  edgeReachabilityAt: null,
  edgeReachabilityDetail: null,
  createdByUserId: null,
  createdAt: "2026-08-14T10:00:00.000Z",
  updatedAt: "2026-08-14T10:00:00.000Z"
};

/** Capture the lines `printVibeApp` writes, stripped of colour. */
function captureVibeApp(app: VibeAppDto): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  });
  try {
    printVibeApp(app);
  } finally {
    spy.mockRestore();
  }
  // eslint-disable-next-line no-control-regex
  return lines.map((line) => line.replace(/\[[0-9;]*m/g, ""));
}

function shipGateRow(app: VibeAppDto): string {
  const row = captureVibeApp(app).find((line) => line.startsWith("Ship gate"));
  expect(row, "`app get` printed no Ship gate row at all").toBeDefined();
  return row ?? "";
}

describe("formatShipGateMode — the three states are three lines", () => {
  it("renders WARN as warn, never as off", () => {
    const line = formatShipGateMode("WARN");
    expect(line).toContain("warn");
    expect(line).not.toContain("off");
  });

  it("gives each of the three modes a distinct line", () => {
    const lines = [
      formatShipGateMode("OFF"),
      formatShipGateMode("WARN"),
      formatShipGateMode("ENFORCE")
    ];
    expect(new Set(lines).size).toBe(3);
  });

  it("says WARN still ships the deploy, so the state is not read as a block", () => {
    expect(formatShipGateMode("WARN")).toMatch(/not block|ships/i);
  });

  it("says ENFORCE refuses, so it is not read as a warning", () => {
    expect(formatShipGateMode("ENFORCE")).toContain("refused");
  });

  it("renders an ABSENT mode as unreported, never as off", () => {
    // A backend one release behind omits the key. The gate may be running; this
    // server did not say. Printing the default here would rebuild the defect.
    const line = formatShipGateMode(undefined);
    expect(line).toContain("not reported");
    expect(line).not.toMatch(/\boff\b/);
    expect(line).not.toContain("undefined");
  });

  it("echoes a mode this binary has never heard of instead of mapping it", () => {
    // The CLI ships standalone and is pointed at NEWER backends. A fourth mode
    // rendered as one of the three known ones is the same lie one version on.
    // @ts-expect-error — deliberately a value outside the union, which is what a
    // newer backend can send to an installed binary.
    const line = formatShipGateMode("BLOCK_AND_PAGE");
    expect(line).toContain("BLOCK_AND_PAGE");
    expect(line).not.toMatch(/\boff\b/);
  });
});

describe("vibe app get — the Ship gate row", () => {
  it("prints warn for a WARN app whose requireVerification boolean is false", () => {
    // The whole ticket in one assertion. Point the row back at
    // `requireVerification` and this reds.
    const row = shipGateRow(WARN_APP);
    expect(row).toContain("warn");
    expect(row).not.toMatch(/\boff\b/);
  });

  it("prints off for an OFF app", () => {
    expect(shipGateRow({ ...WARN_APP, shipGateMode: "OFF" })).toContain("off");
  });

  it("prints enforce for an ENFORCE app", () => {
    const row = shipGateRow({
      ...WARN_APP,
      shipGateMode: "ENFORCE",
      requireVerification: true
    });
    expect(row).toContain("enforce");
  });

  it("tells the three states apart on the row itself, not only in the formatter", () => {
    const rows = [
      shipGateRow({ ...WARN_APP, shipGateMode: "OFF" }),
      shipGateRow(WARN_APP),
      shipGateRow({ ...WARN_APP, shipGateMode: "ENFORCE", requireVerification: true })
    ];
    expect(new Set(rows).size).toBe(3);
  });

  it("does not claim off when the server sent no mode at all", () => {
    const { shipGateMode: _absent, ...withoutMode } = WARN_APP;
    const row = shipGateRow(withoutMode);
    expect(row).toContain("not reported");
  });
});

describe("vibe app update --ship-gate — reaching all three states", () => {
  it("reaches WARN, which no boolean flag can express", () => {
    expect(buildAppUpdateBody({ shipGate: "warn" })).toEqual({ shipGateMode: "WARN" });
  });

  it("reaches off and enforce too", () => {
    expect(buildAppUpdateBody({ shipGate: "off" })).toEqual({ shipGateMode: "OFF" });
    expect(buildAppUpdateBody({ shipGate: "enforce" })).toEqual({ shipGateMode: "ENFORCE" });
  });

  it("forgives case and surrounding whitespace", () => {
    expect(buildAppUpdateBody({ shipGate: " Warn " })).toEqual({ shipGateMode: "WARN" });
  });

  it("REFUSES an unrecognised value rather than reading it as off", () => {
    // A coerced value would switch a gate off and print a success line.
    for (const raw of ["true", "on", "ENFORCED", "1", ""]) {
      expect(() => buildAppUpdateBody({ shipGate: raw }), JSON.stringify(raw)).toThrow(
        /Invalid --ship-gate/
      );
    }
  });

  it("refuses --ship-gate together with --require-verification", () => {
    expect(() => buildAppUpdateBody({ shipGate: "warn", requireVerification: "true" })).toThrow(
      /contradict/
    );
  });

  it("still honours --require-verification on its own", () => {
    expect(buildAppUpdateBody({ requireVerification: "true" })).toEqual({
      requireVerification: true
    });
  });

  it("names --ship-gate in the empty-change-set refusal", () => {
    // A flag missing from that sentence is a flag nobody discovers.
    expect(() => buildAppUpdateBody({})).toThrow(/--ship-gate/);
  });
});
