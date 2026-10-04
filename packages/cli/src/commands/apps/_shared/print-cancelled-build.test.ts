import { afterEach, describe, expect, it } from "vitest";

import { setJsonMode } from "../../../output";
import type { VibeBuildJobDto, VibeDeploymentDto } from "../../../vibe-deployment-wire-types";
import { printCancelledBuild } from "./print-cancelled-build";

const DEPLOYMENT = (status: string): VibeDeploymentDto => ({
  id: "66666666-7777-4888-8999-aaaaaaaaaaaa",
  vibeAppId: "11111111-2222-4333-8444-555555555555",
  color: "BLUE",
  versionNumber: 14,
  status,
  triggerSha: "4f1c9a2e7b3d5c8f0a1e2d3c4b5a69788796a5b4",
  imageRef: "",
  detectedPort: null,
  forceRebuild: false,
  errorReason: null,
  createdAt: "2026-10-01T09:30:00.000Z"
});

const JOB = (status: string): VibeBuildJobDto => ({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  vibeDeploymentId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
  status,
  builder: null,
  logsRef: "",
  durationMs: null,
  errorReason: null,
  waiting: null,
  createdAt: "2026-10-01T09:30:00.000Z"
});

function capture(run: () => void): string {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    run();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

describe("printCancelledBuild", () => {
  afterEach(() => setJsonMode(false));

  it("a cancel that landed says so, naming version and commit", () => {
    const text = capture(() =>
      printCancelledBuild({
        outcome: "cancelled",
        deployment: DEPLOYMENT("CANCELLED"),
        buildJob: JOB("CANCELLED")
      })
    );
    expect(text).toContain("Build of v14 (4f1c9a2) cancelled");
  });

  it("a build that had already ended is NEVER reported cancelled — it says what became of it", () => {
    const text = capture(() =>
      printCancelledBuild({
        outcome: "already_ended",
        deployment: DEPLOYMENT("HEALTHY"),
        buildJob: JOB("SUCCEEDED")
      })
    );
    expect(text).toContain("Nothing to cancel — v14 (4f1c9a2) is HEALTHY, build SUCCEEDED.");
    expect(text).not.toMatch(/cancelled/);
  });

  it("--json prints the server's answer, outcome and all", () => {
    setJsonMode(true);
    const text = capture(() =>
      printCancelledBuild({
        outcome: "already_ended",
        deployment: DEPLOYMENT("HEALTHY"),
        buildJob: null
      })
    );
    expect(JSON.parse(text)).toMatchObject({ outcome: "already_ended", buildJob: null });
  });
});
