import { describe, expect, it } from "vitest";

import { formatSeededRepoFirstPushHint } from "./vibe";

/**
 * A tenant repo is materialized with `auto_init`, so it holds a commit before
 * the operator pushes anything, and their first push is rejected with a bare
 * `fetch first` that names no cause.
 *
 * This hint is the ONLY place that cause can be stated. The rejection happens
 * client-side — the pusher's git compares the advertised ref against local
 * history and aborts without sending a packet — so no server-side hook runs and
 * the git host never learns a push was attempted. Measured with git 2.51.0:
 * `pre-receive`, `update` and `post-receive` all fail to fire on the rejected
 * push and all three fire on the same repo when the push is accepted.
 *
 * The assertions are therefore on the WORDS, as in `vibe-deployability.test.ts`:
 * the defect is that an operator could not tell WHY the push was refused, so the
 * test has to be about what they can read.
 */
describe("formatSeededRepoFirstPushHint", () => {
  const project = { id: "11111111-2222-4333-8444-555555555555", defaultBranch: "main" };

  it("names the cause — the repo already has a commit the operator never made", () => {
    const hint = formatSeededRepoFirstPushHint(project);
    expect(hint).toContain("initial commit");
  });

  it("quotes git's own words verbatim, so the operator can match what they saw", () => {
    // The operator's screen says exactly `fetch first` and nothing else. A hint
    // that paraphrases it ("non-fast-forward") is not findable from the symptom.
    expect(formatSeededRepoFirstPushHint(project)).toContain("fetch first");
  });

  it("gives BOTH remedies — starting fresh and keeping local work are different fixes", () => {
    const hint = formatSeededRepoFirstPushHint(project);
    // Someone who has not written code yet should clone; someone who already
    // has commits must not be told to clone, because that discards their work.
    expect(hint).toContain("nexus vibe git-project clone");
    expect(hint).toContain("git fetch origin");
    expect(hint).toContain("git rebase");
  });

  it("names the project's own id, so the clone command is runnable as printed", () => {
    expect(formatSeededRepoFirstPushHint(project)).toContain(
      "11111111-2222-4333-8444-555555555555"
    );
  });

  /**
   * The branch is the trap. `--default-branch` is a real option on
   * `git-project create`, so a hint that hardcodes `main` prints a rebase
   * command that fails for every project that took it — and it fails with
   * `invalid upstream`, which is a WORSE message than the one being fixed.
   */
  it("rebases onto the project's OWN default branch, not a hardcoded main", () => {
    const hint = formatSeededRepoFirstPushHint({ id: "p1", defaultBranch: "trunk" });
    expect(hint).toContain("origin/trunk");
    expect(hint).not.toContain("origin/main");
  });

  it("still says main when main is what the project actually uses", () => {
    expect(formatSeededRepoFirstPushHint(project)).toContain("origin/main");
  });

  it("renders no placeholder holes when a field is empty", () => {
    const hint = formatSeededRepoFirstPushHint({ id: "", defaultBranch: "" });
    expect(hint).not.toContain("undefined");
    expect(hint).not.toContain("null");
  });
});
