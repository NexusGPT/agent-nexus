import { NexusApiError } from "@agent-nexus/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleError } from "./errors";

/** Capture everything the handler writes to stderr. */
function capture(err: unknown): { exitCode: number; output: string } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  const exitCode = handleError(err);
  spy.mockRestore();
  return { exitCode, output: lines.join("\n") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleError next steps", () => {
  // The API's message names the CONDITION and stops there, because the console
  // renders the same string. The command that resolves it is the terminal's own
  // affordance, so the CLI adds it — keyed off the code, not the prose.
  it("offers the provision command for a cluster-not-ready conflict", () => {
    const { exitCode, output } = capture(
      new NexusApiError(
        "VIBE_GIT_PROJECT_CLUSTER_NOT_READY",
        "Cannot create a git project: your organization has no dedicated Vibe cluster — a repository hosted by Nexus is created on your own cluster, so one must be provisioned first",
        409
      )
    );

    expect(exitCode).toBe(1);
    // The API's own reason still leads — the hint never replaces it.
    expect(output).toContain("no dedicated Vibe cluster");
    expect(output).toContain("nexus vibe cluster provision --region");
    // The alternative nobody guesses from the message alone: a project with its
    // own remote is cloned by the build and needs no cluster at all.
    expect(output).toContain("--git-url");
  });

  it("keys the hint off the code, so rewording the API's prose cannot drop it", () => {
    const { output } = capture(
      new NexusApiError("VIBE_GIT_PROJECT_CLUSTER_NOT_READY", "totally different wording", 409)
    );

    expect(output).toContain("nexus vibe cluster provision --region");
  });

  it("leaves a conflict it has no next step for exactly as the API stated it", () => {
    const { output } = capture(
      new NexusApiError("VIBE_GIT_PROJECT_ALREADY_EXISTS", "name is already taken", 409)
    );

    expect(output).toContain("name is already taken");
    expect(output).not.toContain("nexus vibe cluster provision");
  });
});
