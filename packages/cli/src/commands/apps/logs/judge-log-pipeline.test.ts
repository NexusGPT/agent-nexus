import { describe, expect, it } from "vitest";

import type { VibeLogPipelineHealthDto } from "../../../vibe-wire-types";
import { judgeLogPipeline, judgeLogPipelineBeforeFollow } from "./judge-log-pipeline";

const HEALTHY: VibeLogPipelineHealthDto = {
  status: "healthy",
  reason: "all_nodes_reporting",
  detail: "Every node's canary reached the log store in the last 10 minutes.",
  expectedNodes: 3,
  reportingNodes: 3,
  silentNodes: [],
  checkedAt: "2026-09-29T12:00:00.000Z"
};
const SILENT: VibeLogPipelineHealthDto = {
  ...HEALTHY,
  status: "unhealthy",
  reason: "nodes_silent",
  detail: "1 of 3 node(s) sent no canary line in the last 10 minutes.",
  reportingNodes: 2,
  silentNodes: ["ip-10-0-133-15"]
};

describe("judgeLogPipeline — the page matrix", () => {
  it("healthy + lines: trusted, nothing to say", () => {
    expect(judgeLogPipeline(HEALTHY, 5)).toEqual({ kind: "trusted", note: null });
  });

  it("healthy + EMPTY: trusted, and it says the window really is empty", () => {
    const judgement = judgeLogPipeline(HEALTHY, 0);
    expect(judgement.kind).toBe("trusted");
    expect(judgement.kind === "trusted" ? judgement.note : null).toContain(
      "No log lines in this window. The log pipeline is healthy (3/3"
    );
  });

  it("unhealthy + EMPTY: untrusted — the empty result is no answer, and the silent node is named", () => {
    const judgement = judgeLogPipeline(SILENT, 0);
    expect(judgement.kind).toBe("untrusted");
    const message = judgement.kind === "untrusted" ? judgement.message : "";
    expect(message).toContain("No log lines, and that is not an answer");
    expect(message).toContain("Silent nodes: ip-10-0-133-15.");
  });

  it("unhealthy + lines: untrusted — they may be incomplete", () => {
    const judgement = judgeLogPipeline(SILENT, 5);
    expect(judgement.kind === "untrusted" ? judgement.message : "").toContain(
      "These lines may be incomplete"
    );
  });

  it("an ABSENT verdict (older gateway) is untrusted, never healthy", () => {
    const judgement = judgeLogPipeline(undefined, 0);
    expect(judgement.kind === "untrusted" ? judgement.message : "").toContain(
      "predates pipeline health checks"
    );
  });

  it("an unverified verdict is treated exactly like unhealthy", () => {
    expect(
      judgeLogPipeline({ ...HEALTHY, status: "unverified", reason: "check_failed" }, 0).kind
    ).toBe("untrusted");
  });
});

describe("judgeLogPipelineBeforeFollow", () => {
  it("proceeds silently on a healthy pipeline", () => {
    expect(judgeLogPipelineBeforeFollow(HEALTHY)).toEqual({ kind: "trusted", note: null });
  });

  it("refuses to follow a pipeline it cannot vouch for", () => {
    const judgement = judgeLogPipelineBeforeFollow(SILENT);
    expect(judgement.kind === "untrusted" ? judgement.message : "").toContain("Not following");
  });
});
