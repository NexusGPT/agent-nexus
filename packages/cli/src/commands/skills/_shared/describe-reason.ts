import type { TargetReason } from "../../../util/claude-target";

/** The sentence `skills where` prints, and the location picker's labels. */
export function describeReason(reason: TargetReason, root: string): string {
  switch (reason) {
    case "explicit":
      return `using the directory you passed (--dir)`;
    case "global":
      return `installing globally into ${root}`;
    case "detected-claude":
      return `found an existing .claude folder at ${root}`;
    case "detected-md":
      return `found CLAUDE.md at ${root}`;
    case "detected-git":
      return `using the git repo root ${root}`;
    case "cwd":
      return `no project marker found — using the current directory ${root}`;
  }
}
