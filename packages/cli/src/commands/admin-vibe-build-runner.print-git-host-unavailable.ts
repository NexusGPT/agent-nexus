/**
 * Prints the build-runner tick outcome `git_host_unavailable`: the build clones
 * from its organization's own git host, no live clone URL could be composed, so
 * the dispatcher left it queued. Its own module so the tick printer stays under
 * this package's file-length cap.
 */

import { type AdminVibeBuildRunnerTickResponse } from "../admin-wire-types";
import { color, printRecord } from "../output";

type GitHostUnavailable = Extract<
  AdminVibeBuildRunnerTickResponse,
  { kind: "git_host_unavailable" }
>;

const REASON_WORDS: Record<string, string> = {
  no_git_host_address: "the git host has no live address (unhealthy, or its address is unreadable)",
  no_repo_path: "the project is hosted on the git host but has no recorded repository path"
};

export function printGitHostUnavailable(data: GitHostUnavailable): void {
  printRecord(
    {
      outcome: color.yellow("git_host_unavailable"),
      buildJobId: data.buildJobId,
      organizationId: data.organizationId,
      reason: REASON_WORDS[data.reason] ?? data.reason,
      next: "left queued, not failed — admitted once a live clone URL can be composed"
    },
    [
      { key: "outcome", label: "Outcome" },
      { key: "buildJobId", label: "Build job" },
      { key: "organizationId", label: "Organization" },
      { key: "reason", label: "Reason" },
      { key: "next", label: "Next" }
    ]
  );
}
