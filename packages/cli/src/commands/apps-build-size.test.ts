import { describe, expect, it, vi } from "vitest";

import type { VibeAppDto } from "../vibe-wire-types";
import { buildAppUpdateBody } from "./apps/_shared/build-app-update-body";
import { printVibeApp } from "./apps/_shared/print-vibe-app";

/**
 * `buildComputeSize` — the compute an app's image builds on. `apps update
 * --build-size` sets it and `apps get` prints it. Every assertion separates the
 * two sizes, because a suite that only ever sees LARGE passes against a flag
 * that is silently dropped (the server defaults to LARGE).
 */

const APP: VibeAppDto = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  name: "greeter",
  description: null,
  requireApprovals: false,
  requireVerification: false,
  shipGateMode: "OFF",
  deployBranch: "main",
  resourceQuotas: { cpuMhz: 1000, memoryMiB: 1024, maxInstances: 5 },
  buildComputeSize: "MEDIUM",
  healthCheckConfig: {},
  publicUrl: null,
  visibility: "PRIVATE",
  edgeReachability: null,
  edgeReachabilityAt: null,
  edgeReachabilityDetail: null,
  createdByUserId: null,
  createdAt: "2026-10-02T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z"
};

function buildSizeRow(app: VibeAppDto): string {
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
  const row = lines
    .map((l) => l.replace(/\[[0-9;]*m/g, ""))
    .find((l) => l.startsWith("Build size"));
  expect(row, "`app get` printed no Build size row at all").toBeDefined();
  return row ?? "";
}

describe("apps update --build-size", () => {
  it("sends MEDIUM for medium, any case", () => {
    expect(buildAppUpdateBody({ buildSize: " Medium " })).toEqual({ buildComputeSize: "MEDIUM" });
  });

  it("control: sends LARGE for large, so the arm above can fail", () => {
    expect(buildAppUpdateBody({ buildSize: "large" })).toEqual({ buildComputeSize: "LARGE" });
  });

  it("refuses anything else rather than coercing it", () => {
    expect(() => buildAppUpdateBody({ buildSize: "xl" })).toThrow(/Invalid --build-size "xl"/);
  });

  it("is a change on its own — no other flag needed", () => {
    expect(Object.keys(buildAppUpdateBody({ buildSize: "medium" }))).toEqual(["buildComputeSize"]);
  });
});

describe("apps get — the Build size row", () => {
  it("prints medium for a MEDIUM app", () => {
    const row = buildSizeRow(APP);
    expect(row).toContain("medium");
    expect(row).not.toContain("large");
  });

  it("prints large for a LARGE app", () => {
    expect(buildSizeRow({ ...APP, buildComputeSize: "LARGE" })).toContain("large");
  });

  it("an absent size is unreported, never large", () => {
    const { buildComputeSize: _omitted, ...older } = APP;
    const row = buildSizeRow(older);
    expect(row).toContain("not reported");
    expect(row).not.toContain("large");
  });
});
