import { color } from "../../../output";

/**
 * The files this install refused to replace, NAMED and not counted.
 *
 * A count is what the old destructive behaviour already printed, and a count
 * cannot tell an operator WHICH of their own files this install would have
 * replaced. Capped at ten names with an "… and N more" tail, because a tree
 * installed before this CLI kept a manifest preserves everything at once.
 */
export function printPreservedPaths(preservedPaths: readonly string[]): void {
  if (preservedPaths.length === 0) return;

  console.log(
    color.yellow(
      `  ${preservedPaths.length} file${preservedPaths.length === 1 ? "" : "s"} left unchanged — ` +
        `on disk, different from the bundle, and not written by this CLI (edited since, or ` +
        `installed before this CLI recorded what it writes). Re-run with --force to replace them:`
    )
  );
  for (const p of preservedPaths.slice(0, 10)) console.log(color.yellow(`      ${p}`));
  if (preservedPaths.length > 10) {
    console.log(color.yellow(`      … and ${preservedPaths.length - 10} more`));
  }
}
