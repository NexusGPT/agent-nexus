/**
 * `printVibeGitProject` — the build source line.
 *
 * While the tenant git host has no live address the backend withholds a hosted
 * repo's clone URL (`gitRemoteUrl: null`, `gitRemoteState: git_host_unavailable`)
 * rather than answer with the host's last IP. A bare dash there would read as
 * "this project has no remote", which is a different and wrong sentence.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { VibeGitProjectDto } from "../../../vibe-wire-types";
import { printVibeGitProject } from "./print-vibe-git-project";

const PROJECT: VibeGitProjectDto = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "org_print",
  name: "billing",
  description: null,
  defaultBranch: "main",
  s3Prefix: "",
  hookSecretRef: "",
  gitRemoteUrl: "http://10.0.143.60:23000/vibe-platform/billing.git",
  gitRemoteState: "available",
  status: "READY",
  createdByUserId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

// eslint-disable-next-line no-control-regex
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

/** The value printed on the "Build source" line. */
function buildSource(project: VibeGitProjectDto): string {
  const chunks: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  try {
    printVibeGitProject(project);
  } finally {
    logSpy.mockRestore();
  }
  const line = plain(chunks.join("\n"))
    .split("\n")
    .find((l) => l.trimStart().startsWith("Build source"));
  return line === undefined ? "<no Build source line>" : line.trimStart().slice(12).trim();
}

describe("printVibeGitProject — Build source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the clone URL when there is one", () => {
    expect(buildSource(PROJECT)).toBe(PROJECT.gitRemoteUrl);
  });

  it("says in words that the git host is unavailable, and that builds wait", () => {
    const text = buildSource({
      ...PROJECT,
      gitRemoteUrl: null,
      gitRemoteState: "git_host_unavailable"
    });

    expect(text).toContain("unavailable");
    expect(text).toContain("no live address");
    expect(text).toContain("Builds wait");
  });

  it("prints a dash for a project with no remote, and for a backend that predates the state", () => {
    expect(buildSource({ ...PROJECT, gitRemoteUrl: null, gitRemoteState: "none" })).toBe("—");
    const { gitRemoteState: _omitted, ...older } = PROJECT;
    expect(buildSource({ ...older, gitRemoteUrl: null })).toBe("—");
  });
});
