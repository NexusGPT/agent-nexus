import { afterEach, describe, expect, it, vi } from "vitest";

import { ALREADY_ACTIVE_ADVICE } from "./print-provision-outcome";
import { printVibeCluster } from "./print-vibe-cluster";

const UPDATE_PENDING_SENTENCE = "A routine configuration update is waiting to be applied.";

function printed(): string[] {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  printVibeCluster({
    cluster: {
      status: "DEGRADED",
      condition: { kind: "UPDATE_PENDING", summary: UPDATE_PENDING_SENTENCE },
      gitHostStatus: "HEALTHY",
      telemetryStatus: "HEALTHY"
    }
  });
  return log.mock.calls.map((call) => String(call[0]));
}

describe("nexus apps cluster status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the cluster's condition sentence on its own Condition line", () => {
    const line = printed().find((l) => l.includes("Condition"));
    expect(line).toContain(UPDATE_PENDING_SENTENCE);
  });

  it("prints no Reason line — the raw reason never reaches a tenant", () => {
    const lines = printed();
    expect(lines.some((l) => l.includes("Condition"))).toBe(true);
    expect(lines.some((l) => l.includes("Reason"))).toBe(false);
  });
});

describe("provision against a DEGRADED cluster", () => {
  it("sends the user to the condition rather than to a reason line that no longer prints", () => {
    expect(ALREADY_ACTIVE_ADVICE.DEGRADED).toContain("condition");
    expect(ALREADY_ACTIVE_ADVICE.DEGRADED).not.toContain("Reason");
  });
});
