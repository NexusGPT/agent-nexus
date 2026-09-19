import { color, isJsonMode, printRecord } from "../../../output";
import { type VibeGitProjectAliasDto } from "../../../vibe-wire-types";
import { formatSeededRepoFirstPushHint } from "./format-seeded-repo-first-push-hint";
import { formatTimestamp } from "./format-timestamp";

/**
 * `freshlyProvisioned` marks the commands that MINT or re-materialize the repo —
 * the ones after which a first push is imminent. `attach-repo` and `get` pass it
 * false: those speak about a project that already holds the operator's code, so
 * the seeded-repo warning would be noise at best and wrong at worst.
 */
/**
 * Takes the ALIAS shape, not the full project, so both callers type-check: the
 * app-scoped reads fall back to `data.repository`, whose `name`, `description` and
 * `defaultBranch` are optional on the wire. A full `VibeGitProjectDto` is assignable
 * to it, so the standalone routes are unaffected.
 *
 * An absent field renders as "not sent by this backend" rather than as a blank line —
 * `printRecord` stringifies `undefined` to `""`, which reads as an empty value the
 * server chose rather than a key it never sent.
 */
export function printVibeGitProject(
  project: VibeGitProjectAliasDto,
  opts: { freshlyProvisioned?: boolean } = {}
): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(project, null, 2));
    return;
  }

  const orAbsent = (v: unknown): string =>
    v === undefined ? color.dim("— not sent by this backend") : String(v);

  printRecord(project, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name", format: orAbsent },
    { key: "defaultBranch", label: "Default branch", format: orAbsent },
    { key: "status", label: "Status" },
    {
      key: "gitRemoteUrl",
      label: "Build source",
      format: (v) => (v === null ? "—" : String(v))
    },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => formatTimestamp(String(v)) }
  ]);
  console.log("");
  console.log(color.dim("To push to this project, run: nexus apps git-credentials"));
  if (opts.freshlyProvisioned === true) {
    console.log("");
    console.log(formatSeededRepoFirstPushHint(project));
  }
}
