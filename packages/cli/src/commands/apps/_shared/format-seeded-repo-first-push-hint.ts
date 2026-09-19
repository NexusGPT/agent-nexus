import { color } from "../../../output";

/**
 * The seeded-repo first-push warning, and the two commands that work.
 *
 * A tenant repo is materialized with `auto_init`, so it already carries a commit
 * before the operator has pushed anything. Their first push from a local repo
 * they started themselves is a non-fast-forward, and git refuses it with a bare
 * `fetch first` that names no cause: the operator's repo is missing a commit
 * they never made and were never told about.
 *
 * This MUST be said before the push, because nothing can say it during one. A
 * non-fast-forward is rejected CLIENT-SIDE — the pusher's own git compares the
 * advertised ref against local history and aborts without sending a single
 * packet, so no server-side hook runs. Not `post-receive`, and not a
 * `pre-receive` hook either: the git host is never told a push was attempted,
 * and therefore has nothing to annotate. Provisioning is the last moment at
 * which the platform can speak at all, which is why the sentence lives here
 * rather than in a hook.
 */
export function formatSeededRepoFirstPushHint(project: {
  id: string;
  defaultBranch?: string;
}): string {
  return [
    color.yellow("This project's repo is created with an initial commit already on it."),
    `A first push from a local repo you started yourself is rejected with "fetch first".`,
    "Start from the repo, or replay local work you already have onto it:",
    `  nexus apps git-project clone ${project.id}`,
    // `defaultBranch` is optional on the deprecated `repository` alias, which is
    // the only value a pre-decoupling backend sends. Interpolating it blind
    // printed `git rebase origin/undefined` — a command that cannot work,
    // rendered as one that can.
    project.defaultBranch === undefined
      ? `  git fetch origin && git rebase origin/<the project's default branch>`
      : `  git fetch origin && git rebase origin/${project.defaultBranch}`
  ].join("\n");
}
